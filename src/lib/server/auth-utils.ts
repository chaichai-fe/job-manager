import { getRequest } from '@tanstack/react-start/server'
import { getAuth } from '../../auth/server'

export type SessionUser = {
  id: string
  name: string
  email: string
  image?: string | null
}

/** 读取当前请求的登录用户（未登录返回 null）。仅在服务端调用。 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({
    headers: getRequest().headers,
  })
  if (!session?.user) return null
  const { id, name, email, image } = session.user
  return { id, name, email, image }
}

/** 要求登录，返回 userId，否则抛出 401。 */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Response('Unauthorized', { status: 401 })
  }
  return user.id
}
