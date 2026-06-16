# TanStack Start + Cloudflare Worker 部署与运行原理笔记

> 围绕 `job-manager` 项目（TanStack Start + Cloudflare Workers + D1 + KV）整理。

## 目录

1. [部署流程](#1-部署流程)
2. [构建产物：client vs server](#2-构建产物client-vs-server)
3. [Worker 运行时 vs Node.js 运行时](#3-worker-运行时-vs-nodejs-运行时)
4. [为什么 Worker 也能跑服务端代码](#4-为什么-worker-也能跑服务端代码)
5. [老框架 vs 现代框架：为什么不挑运行时](#5-老框架-vs-现代框架为什么不挑运行时)
6. [项目对应关系速查](#6-项目对应关系速查)

---

## 1. 部署流程

项目部署命令（`package.json`）：

```jsonc
"deploy": "bun run build && wrangler deploy",
"deploy:full": "wrangler d1 migrations apply DB --remote && bun run deploy"
```

- `deploy:full`：先把 D1 远程数据库迁移应用上去，再 `build` + `wrangler deploy`。
- 部署目标：`https://job-manager.2768505574.workers.dev`
- 每次部署生成一个 **Version ID**，绑定 D1 / KV / 环境变量后上线。

部署日志关键阶段：


| 日志片段                                                     | 含义                        |
| -------------------------------------------------------- | ------------------------- |
| `building client environment for production`             | 构建浏览器端资源                  |
| `building ssr environment for production`                | 构建服务端（SSR）代码              |
| `Attaching additional modules`                           | 把 server 代码作为模块附加进 Worker |
| `Found N new or modified static assets to upload`        | 上传 client 静态资源            |
| `Uploaded job-manager` / `Deployed job-manager triggers` | Worker 脚本上传并上线            |


---

## 2. 构建产物：client vs server

构建会产生两部分产物：


| 产物                                 | 位置             | 去向                                         |
| ---------------------------------- | -------------- | ------------------------------------------ |
| **client**（浏览器端）                   | `dist/client/` | 作为静态资源上传到 Cloudflare（Workers Assets / CDN） |
| **server**（SSR + Server Functions） | `dist/server/` | 打包成 Worker 脚本，跑在 Cloudflare Worker 运行时里    |


分工：

1. **静态资源**（JS/CSS chunks）由 Cloudflare 的 asset 层直接提供，不消耗 Worker 计算。
2. **Worker 脚本**（server 部分）负责：
  - 服务端渲染（SSR）首屏 HTML
  - 处理 Server Functions / API 路由
  - 访问绑定资源：`env.DB`（D1）、`env.KV`、环境变量

`wrangler.jsonc` 入口指向 TanStack Start 的服务端入口：

```jsonc
"main": "@tanstack/react-start/server-entry"
```

---

## 3. Worker 运行时 vs Node.js 运行时

**Worker 不是 Node.js，而是基于 V8 isolate 的另一套运行时。**


| 维度   | Node.js                                        | Cloudflare Worker                                   |
| ---- | ---------------------------------------------- | --------------------------------------------------- |
| 运行单元 | 进程（process），独占内存/事件循环                          | V8 **isolate**，多个共享一个进程                             |
| 冷启动  | 几十~几百 ms                                       | ~5ms（本项目实测 `Worker Startup Time: 16 ms`）            |
| 部署位置 | 单一/少数服务器或容器                                    | 全球边缘节点，请求就近执行                                       |
| 生命周期 | 长驻进程，可持有连接池、定时器、全局状态                           | 按请求短暂存活，状态不保证持久                                     |
| 计费   | 按机器时间                                          | 按 CPU 时间（I/O 等待不计费）                                 |
| API  | `fs`/`net`/`http`/`Buffer`/`process` 等 Node 内置 | Web 标准 API（`fetch`/`Request`/`Response`/`crypto` 等） |


入口写法差异：

```js
// Node.js 风格
import http from 'node:http'
http
  .createServer((req, res) => {
    /* ... */
  })
  .listen(3000)

// Worker 风格
export default {
  async fetch(request, env, ctx) {
    return new Response('hello')
  },
}
```

---

## 4. 为什么 Worker 也能跑服务端代码

两个原因：

### (a) 现代服务端框架面向 Web 标准

框架核心是处理 `Request → Response`，这套接口在 Worker 和 Node 里都成立，所以同一份 SSR/路由逻辑能跨运行时。

### (b) `nodejs_compat` 兼容层补齐 Node API

```jsonc
"compatibility_flags": ["nodejs_compat"]
```

它让 Worker 运行时实现/垫片了一部分 Node.js API（`node:buffer`、`node:crypto`、`node:stream`、`process` 等），这样 `better-auth`、`drizzle-orm` 等假设 Node 环境的库也能正常运行。

### Worker 环境下的限制（不能用的 Node 模式）

- ❌ 读写本地文件系统（边缘节点没有可写磁盘）
- ❌ 长驻 TCP 连接池、常驻定时器
- ❌ 直连 Postgres/MySQL 的原生 TCP 驱动（需 HTTP 驱动或 Hyperdrive）
- ❌ 依赖 `__dirname`、监听端口

改用**绑定（bindings）**访问资源，在 `fetch(request, env, ctx)` 的 `env` 参数注入：

- `env.DB` → **D1**（SQLite）
- `env.KV` → **KV**（键值存储）

---

## 5. 老框架 vs 现代框架：为什么不挑运行时

**一句话：老框架把逻辑绑死在某个运行时的私有 API 上；现代框架只依赖跨运行时都实现的「标准接口」，差异用「适配器」抹平。**

### 服务器的本质

任何 Web 服务剥到最里层都是：`输入 Request → 处理 → 输出 Response`。区别只在于请求/响应用什么数据结构表示。

### 老框架：依赖运行时私有方言

```js
// Express —— 直接操作 Node 专有的 req / res
app.get('/user', (req, res) => {
  const id = req.query.id // Node 专有对象
  res.status(200).json({ id }) // 这套 API 只有 Node 有
})
```

`req`（`http.IncomingMessage`）和 `res`（`http.ServerResponse`）是 Node 独有的类，其他运行时没有，逻辑也就跑不了。

### 现代框架：依赖 Web 标准

```js
// 标准签名：吃一个 Request，吐一个 Response
async function handler(request) {
  const id = new URL(request.url).searchParams.get('id')
  return new Response(JSON.stringify({ id }), { status: 200 })
}
```

`Request` / `Response` / `URL` / `Headers` 是 WHATWG/Web 标准，被浏览器、Worker、Deno、Bun、Node(v18+) 全部实现，所以基于标准写的代码到处都能跑。

### 核心封装逻辑：适配器（Adapter）模式

框架核心保持纯粹（只认 `Request → Response`），针对每个运行时写一层薄「翻译」对接入口：

```
                    ┌─────────────────────────────┐
   各运行时入口      │     框架核心（纯标准）        │
                    │  handler(Request): Response  │
                    └─────────────────────────────┘
                              ▲        │
            Request ──────────┘        └────────── Response
                              ▲                    │
        ┌─────────────────────┴────────────────────▼──────────────┐
        │  Node 适配器      │  Worker 适配器   │  Deno 适配器 │ ...  │
        │ req→Request       │ 已经是 Request   │ 已经是 Request│      │
        │ Response→res      │ 直接 return      │ 直接 return   │      │
        └───────────────────┴──────────────────┴──────────────────┘
```

- **Worker/Deno/Bun**：入口本来就是 `Request`，几乎零翻译。
- **Node.js**：适配器把老的 `req/res` 翻译成标准对象，再把 `Response` 翻译回 `res`。

框架 99% 的代码只跟标准 `Request/Response` 打交道，换运行时 = 换一个适配器，核心一行不动。

### 对照表


| 维度      | 老框架（Express/Koa）    | 现代框架（TanStack Start/Hono/Remix） |
| ------- | ------------------- | ------------------------------- |
| 请求/响应对象 | Node 专有 `req`/`res` | Web 标准 `Request`/`Response`     |
| 依赖能力    | Node 私有 API         | WHATWG 标准 API                   |
| 跨运行时    | ❌ 基本只能 Node         | ✅ Worker/Deno/Bun/Node 通吃       |
| 适配方式    | 框架本身就是 Node 程序      | 核心不变 + 各运行时一层 adapter           |
| 心智模型    | "我在写一个 Node 服务"     | "我在写一个 `Request→Response` 函数"   |


---

## 6. 项目对应关系速查


| 概念                | 本项目对应                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| 服务端入口（Worker 适配器） | `@tanstack/react-start/server-entry`                                                     |
| 数据库绑定             | `env.DB` → D1（`job-manager-db`）                                                          |
| KV 绑定             | `env.KV`                                                                                 |
| Node 兼容           | `compatibility_flags: ["nodejs_compat"]`                                                 |
| 依赖兼容层的库           | `better-auth`、`drizzle-orm`                                                              |
| 线上地址              | [https://job-manager.2768505574.workers.dev](https://job-manager.2768505574.workers.dev) |


> **总结**：Worker 是轻量、全球分布、按请求执行的 V8 isolate 运行时，天生说 Web 标准「方言」。现代框架基于 `Request/Response` 标准 + `nodejs_compat` 垫片，使服务端代码与运行时解耦，实现「一次编写，到处运行」。

