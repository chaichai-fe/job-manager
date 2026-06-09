# 工作台 · Job Manager

个人工作常用内容管理站，基于 **TanStack Start** 构建，部署在 **Cloudflare Workers**。

核心功能：

- **登录 / 注册**：基于 [better-auth](https://better-auth.com)（邮箱 + 密码，多用户）
- **开发中项目**：需求 / 项目 / 分支 / 状态 / 备注 的表格管理（增删改查）
- **Gitlab & Jenkins**：按仓库分组的代码库与流水线链接
- **账号体系**：测试账号、密码与详细信息（支持粘贴 JSON）
- 深色 / 浅色主题切换

## 技术栈

| 领域     | 选型                                                                 |
| -------- | -------------------------------------------------------------------- |
| 框架     | TanStack Start (React 19 + TypeScript)                               |
| 部署     | Cloudflare Workers (`@cloudflare/vite-plugin`)                       |
| 数据库   | Cloudflare **D1**（SQLite）+ [Drizzle ORM](https://orm.drizzle.team) |
| 会话存储 | Cloudflare **KV**（better-auth secondaryStorage）                    |
| 认证     | better-auth + `better-auth-cloudflare`                               |
| UI       | Tailwind CSS v4 + shadcn/ui                                          |
| 数据请求 | TanStack Query                                                       |

> 说明：better-auth 的用户 / 账号等关系数据存放在 **D1**，会话（session、限流）存放在 **KV**。这是 better-auth 在 Cloudflare 上的标准组合。

## 本地开发

```bash
bun install          # 安装依赖（postinstall 会自动应用 patches/）
bun run dev          # http://localhost:3000
```

首次运行前需要初始化本地 D1：

```bash
bunx wrangler d1 migrations apply DB --local
```

本地密钥放在 `.dev.vars`（已被 git 忽略），默认已写入一个开发用 `BETTER_AUTH_SECRET`。

## 数据库迁移

Schema 定义在 `src/db/`：

- `auth-schema.ts`：better-auth 生成的认证表（由 `bunx @better-auth/cli generate` 生成）
- `app-schema.ts`：业务表 `projects` / `repo_links` / `account_entries`
- `schema.ts`：合并导出

修改 schema 后：

```bash
bunx drizzle-kit generate                       # 生成迁移 SQL 到 drizzle/migrations
bunx wrangler d1 migrations apply DB --local     # 应用到本地
bunx wrangler d1 migrations apply DB --remote    # 应用到线上
```

## 部署到 Cloudflare

1. 创建 D1 与 KV，并把返回的 id 填入 `wrangler.jsonc`：

   ```bash
   bunx wrangler d1 create job-manager-db      # 填到 d1_databases[0].database_id
   bunx wrangler kv namespace create KV        # 填到 kv_namespaces[0].id
   ```

2. 设置生产密钥与变量：

   ```bash
   bunx wrangler secret put BETTER_AUTH_SECRET
   # 在 wrangler.jsonc 的 vars 中把 BETTER_AUTH_URL / BETTER_AUTH_TRUSTED_ORIGINS
   # 改成你的线上域名，例如 https://job-manager.<account>.workers.dev
   ```

3. 应用迁移并部署：

   ```bash
   bunx wrangler d1 migrations apply DB --remote
   bun run deploy
   ```

## 关于 `patches/`

`@better-auth/kysely-adapter@1.6.14` 的 SQLite dialect 文件从 `kysely` 根入口导入
`DEFAULT_MIGRATION_TABLE` / `DEFAULT_MIGRATION_LOCK_TABLE`，而新版 kysely 已将其移动位置，
会导致打包器报 `MISSING_EXPORT`（参考 better-auth issue #9610 / #9810 / #9868）。

由于本项目使用 Drizzle adapter，Kysely 路径是死代码，`patches/` 里用 `patch-package`
把这两个常量改为本地定义。`bun install` 时会通过 `postinstall` 自动应用，无需手动处理。
（同时通过 `package.json` 的 `overrides` 把 kysely 固定到 `0.28.17`。）

> 若依赖优化报错，删除 `node_modules/.vite` 缓存后重启 `bun run dev` 即可。
