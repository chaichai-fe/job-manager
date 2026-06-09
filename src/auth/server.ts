import { env } from 'cloudflare:workers'
import { createAuth } from './index'
import type { Auth } from './index'

let _auth: Auth | null = null

/** 运行时获取单例 auth 实例（绑定当前 Worker 的 D1 + KV）。 */
export function getAuth(): Auth {
  if (!_auth) {
    _auth = createAuth(env)
  }
  return _auth
}
