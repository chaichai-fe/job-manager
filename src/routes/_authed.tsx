import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { FolderKanban, KeyRound, LinkIcon, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { authClient } from '../lib/auth-client'
import { fetchCurrentUser } from '../server/session'
import { ThemeToggle } from '../components/theme-toggle'
import { Button } from '../components/ui/button'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const user = await fetchCurrentUser()
    if (!user) {
      throw redirect({ to: '/login' })
    }
    return { user }
  },
  component: AuthedLayout,
})

const navItems = [
  { to: '/', label: '工作台', icon: FolderKanban, exact: true },
  { to: '/projects', label: '项目', icon: FolderKanban },
  { to: '/links', label: 'Gitlab & Jenkins', icon: LinkIcon },
  { to: '/accounts', label: '账号体系', icon: KeyRound },
] as const

function AuthedLayout() {
  const router = useRouter()
  const { user } = Route.useRouteContext()

  async function onLogout() {
    await authClient.signOut()
    toast.success('已退出登录')
    await router.invalidate()
    await router.navigate({ to: '/login' })
  }

  return (
    <div className="min-h-screen">
      <header className="site-header sticky top-0 z-30 border-b border-border backdrop-blur">
        <div className="page-wrap flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="display-title text-lg font-bold text-foreground"
            >
              工作台
            </Link>
            <nav className="hidden items-center gap-5 md:flex">
              {navItems.slice(1).map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="nav-link text-sm font-medium"
                  activeProps={{
                    className: 'nav-link is-active text-sm font-medium',
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              title="退出登录"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
        <nav className="page-wrap flex items-center gap-4 pb-3 md:hidden">
          {navItems.slice(1).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="nav-link text-sm font-medium"
              activeProps={{
                className: 'nav-link is-active text-sm font-medium',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="page-wrap py-8">
        <Outlet />
      </main>
    </div>
  )
}
