import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { authClient } from '../lib/auth-client'
import { fetchCurrentUser } from '../server/session'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { ThemeToggle } from '../components/theme-toggle'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const user = await fetchCurrentUser()
    if (user) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await authClient.signUp.email({
          name: name || email.split('@')[0],
          email,
          password,
        })
        if (error) throw new Error(error.message || '注册失败')
        toast.success('注册成功，已自动登录')
      } else {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) throw new Error(error.message || '登录失败')
        toast.success('登录成功')
      }
      await router.invalidate()
      await router.navigate({ to: '/' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="island-shell rise-in w-full max-w-sm rounded-2xl p-8">
        <div className="mb-6 text-center">
          <p className="island-kicker">Job Manager</p>
          <h1 className="display-title mt-2 text-2xl font-bold text-foreground">
            工作台登录
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理项目、链接与账号体系
          </p>
        </div>

        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as 'signin' | 'signup')}
          className="mb-5"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">登录</TabsTrigger>
            <TabsTrigger value="signup">注册</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="name">昵称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="可选"
                autoComplete="nickname"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === 'signup' ? '注册并登录' : '登录'}
          </Button>
        </form>
      </div>
    </div>
  )
}
