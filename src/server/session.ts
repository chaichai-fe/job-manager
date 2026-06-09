import { createServerFn } from '@tanstack/react-start'
import { getCurrentUser } from '../lib/server/auth-utils'

/** 供路由 beforeLoad / 组件读取当前登录用户。 */
export const fetchCurrentUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getCurrentUser()
  },
)
