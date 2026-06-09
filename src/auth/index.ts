import { betterAuth } from 'better-auth/minimal'
import { withCloudflare } from 'better-auth-cloudflare'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { drizzle } from 'drizzle-orm/d1'
import { schema } from '../db/schema'

/**
 * 同一份配置同时服务于：
 *  - 运行时（传入 Cloudflare env，使用 D1 + KV）
 *  - better-auth CLI 生成 schema（不传 env，使用空的 drizzle adapter）
 */
export function createAuth(env?: Env) {
  const db = env ? drizzle(env.DB, { schema }) : ({} as never)

  return betterAuth({
    baseURL: env?.BETTER_AUTH_URL ?? 'http://localhost:3000',
    secret: env?.BETTER_AUTH_SECRET,
    ...withCloudflare(
      {
        autoDetectIpAddress: false,
        geolocationTracking: false,
        cf: {},
        d1: env
          ? {
              db,
              options: { usePlural: true },
            }
          : undefined,
        // 运行时类型由 wrangler 生成，与 better-auth-cloudflare 自带的 workers-types 略有差异
        kv: env?.KV as never,
      },
      {
        emailAndPassword: {
          enabled: true,
          minPasswordLength: 6,
        },
        trustedOrigins: (
          env?.BETTER_AUTH_TRUSTED_ORIGINS ?? 'http://localhost:3000'
        )
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        rateLimit: {
          enabled: true,
          window: 60,
          max: 100,
        },
        plugins: [tanstackStartCookies()],
      },
    ),
    // 仅 CLI 生成 schema 时需要显式 database adapter
    ...(env
      ? {}
      : {
          database: drizzleAdapter(
            {},
            {
              provider: 'sqlite',
              usePlural: true,
            },
          ),
        }),
  })
}

// 供 better-auth CLI 读取（schema 生成用）
export const auth = createAuth()

export type Auth = ReturnType<typeof createAuth>
