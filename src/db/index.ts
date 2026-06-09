import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'
import { schema } from './schema'

export type DB = ReturnType<typeof getDb>

export function getDb() {
  return drizzle(env.DB, { schema })
}
