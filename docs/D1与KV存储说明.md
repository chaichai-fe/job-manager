# D1 与 KV 存储说明

本文记录本项目（job-manager）中 Cloudflare **D1** 与 **KV** 两种存储的定位、分工与实现细节，作为数据存储相关的认知基线。

---

## 一、各自是什么类型的存储

### D1 —— 基于 SQLite 的托管关系型数据库

| 维度     | 特性                                             |
| -------- | ------------------------------------------------ |
| 数据模型 | 关系型（SQL），支持表、外键、事务、索引、JOIN    |
| 底层引擎 | SQLite                                           |
| 部署形态 | Serverless / 托管，按请求付费                    |
| 运行位置 | Cloudflare 边缘网络                              |
| 扩展方式 | 读副本（Read Replication）全球分发，写走单一主库 |
| 单库上限 | 约 10 GB                                         |

类比：≈ MySQL / PostgreSQL（传统关系型主库）。

**适合场景**：读多写少的 Web 应用、中小型业务系统 / SaaS、边缘低延迟应用、原型与个人项目。

**不适合**：写入密集 / 高并发写、超大数据量（TB 级）、需要存储过程等复杂数据库特性、强一致的全球多地写入。

### KV —— 边缘键值存储

| 维度     | 特性                                                             |
| -------- | ---------------------------------------------------------------- |
| 数据模型 | Key-Value 键值对                                                 |
| 存储介质 | 磁盘（边缘节点）+ 热点缓存                                       |
| 一致性   | **最终一致**（写入后全球同步有延迟，最长可达约 60s）             |
| 写入特性 | 适合「写一次、读很多次」，不适合高频写同一 key                   |
| 过期     | 支持 TTL 自动过期                                                |
| 数据结构 | 仅字符串 / 二进制 value，无 List/Set/Hash 等结构，几乎无原子操作 |

类比：使用场景上 ≈ Redis（缓存 / 会话 / 计数），但**本质不同**：KV 是磁盘型、最终一致；Redis 是纯内存、强一致。因此不能拿 KV 当 Redis 做高频实时计数。若真需要强一致 + 高频原子操作，Cloudflare 生态里对应的是 **Durable Objects**。

---

## 二、本项目中的分工

|        | D1（binding `DB`）                 | KV（binding `KV`）                           |
| ------ | ---------------------------------- | -------------------------------------------- |
| 定位   | 唯一可信数据源（底账）             | 缓存 / 计数 / 临时态（便签）                 |
| 数据   | 用户、会话记录、业务数据           | 会话缓存、活跃会话列表、限流计数             |
| 特点   | 结构化、可 JOIN、可索引查询        | 简单 KV、带 TTL、读极快                      |
| 谁在用 | 业务代码（`getDb()`）+ better-auth | 仅 better-auth 内部（作为 secondaryStorage） |

> 一句话：**真正的数据在 D1，跑得快但可丢的状态在 KV。**

---

## 三、D1 里存什么

### 1. 认证相关（`src/db/auth-schema.ts`，由 better-auth 管理）

| 表              | 职责                                         |
| --------------- | -------------------------------------------- |
| `users`         | 用户账号（邮箱、是否验证等）                 |
| `sessions`      | 登录会话记录（token、过期时间、IP、UA）      |
| `accounts`      | 账号凭证（密码 hash、第三方 OAuth token 等） |
| `verifications` | 邮箱验证 / 重置密码等临时凭证                |

### 2. 业务数据（`src/db/app-schema.ts`，自定义功能）

| 表               | 职责                                                |
| ---------------- | --------------------------------------------------- |
| `projects`        | 开发项目 / 需求看板（需求、分支、状态、备注、排序） |
| `repo_links`      | GitLab / Jenkins 等链接集合（按仓库分组）           |
| `account_entries` | 测试账号库（账号、密码、详情）                      |

这些都是读多写少、需按 `userId` 索引查询的关系型数据，适合 D1。

---

## 四、KV 里存什么（具体内容）

KV 在项目中仅出现在 `src/auth/index.ts`，作为 better-auth 的 `secondaryStorage` 传入。实际存放三类具体数据：

### 1. 会话数据（Session）—— 最主要

- **Key**：会话 token（浏览器 Cookie 里那串随机字符串）
- **Value**：用户 + 会话信息的 JSON

```json
// key: "7xK9aBcD2eFg..."   (session token)
{
  "session": {
    "id": "...",
    "token": "7xK9aBcD2eFg...",
    "userId": "user_123",
    "expiresAt": "2026-06-15T...",
    "ipAddress": "1.2.3.4",
    "userAgent": "Mozilla/5.0..."
  },
  "user": {
    "id": "user_123",
    "name": "张三",
    "email": "zhang@example.com",
    "emailVerified": true
  }
}
```

**作用**：每次带 Cookie 的请求，先用 token 去 KV `get`，命中即拿到「你是谁」，避免每次都查 D1。

### 2. 用户的活跃会话列表

- **Key**：`active-sessions-{userId}`，如 `active-sessions-user_123`
- **Value**：该用户当前所有会话 token 的数组（带过期时间）

```json
// key: "active-sessions-user_123"
[
  { "token": "7xK9aBcD...", "expiresAt": 1765000000 },
  { "token": "9zL2mNoP...", "expiresAt": 1766000000 }
]
```

**作用**：支持「所有设备登出」「查看已登录设备」等功能。

### 3. 限流计数器（Rate Limit）

对应 `src/auth/index.ts` 中的配置：

```ts
rateLimit: {
  enabled: true,
  window: 60,
  max: 100,
},
```

- **Key**：请求者标识（如 IP 或 `ip+路径`）
- **Value**：`{ "count": 37, "lastRequest": 1765432100 }`
- **TTL**：60 秒（即 `window`）；60 秒内同一来源超过 100 次（`max`）即拦截，窗口过后 key 自动过期。

---

## 五、持久化 vs 缓存：谁是「权威源」

| 数据                    | D1      | KV                          | 权威源 |
| ----------------------- | ------- | --------------------------- | ------ |
| 用户信息（users）       | ✅ 永久 | 部分（夹在 session 缓存里） | **D1** |
| 会话（sessions）        | ✅ 永久 | ✅ 副本（带 TTL）           | **D1** |
| 业务数据（projects 等） | ✅ 永久 | ❌                          | **D1** |
| 限流计数                | ❌      | ✅ 唯一                     | KV     |

要点：

1. **需要持久化的，一定在 D1**，D1 是唯一可信底账。
2. **Session 两边都有**：D1 是永久底账，KV 是带 TTL 的缓存快照；读取优先 KV，未命中或过期再回 D1。
3. **只有限流计数器只在 KV**，它是纯临时数据，丢失无影响，从不进 D1。

> 核心比喻：**D1 = 账本（权威 + 持久），KV = 便签（快 + 可丢）。** 账本的内容可能被抄一份到便签上加速读取，但便签丢了不影响账本。

---

## 六、如何可视化查看 D1

- **Drizzle Studio**：`bunx --bun drizzle-kit studio`（需在 `drizzle.config.ts` 补全 `dbCredentials`：accountId、databaseId、D1 API token）。
- **本地 SQLite 文件**：`wrangler dev` 后位于 `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`，可用 TablePlus / DB Browser for SQLite 打开。
- **命令行**：
  ```bash
  # 本地
  bunx wrangler d1 execute job-manager-db --local --command "SELECT * FROM users LIMIT 10"
  # 线上
  bunx wrangler d1 execute job-manager-db --remote --command "SELECT * FROM users LIMIT 10"
  ```
- **Cloudflare Dashboard**：Workers & Pages → D1 → `job-manager-db` → Console，直接跑 SQL 查看线上数据，无需配置。
