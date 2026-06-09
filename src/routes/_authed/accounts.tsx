import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
} from '../../server/accounts'
import type { AccountInput } from '../../server/accounts'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Skeleton } from '../../components/ui/skeleton'
import { ConfirmDialog } from '../../components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

export const Route = createFileRoute('/_authed/accounts')({
  component: AccountsPage,
})

type AccountRow = AccountInput & { id: string }

const EMPTY: AccountInput = {
  category: '测试账号',
  account: '',
  password: '',
  detail: '',
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`已复制${label}`)
  } catch {
    toast.error('复制失败')
  }
}

function AccountsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccounts(),
  })

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AccountRow | null>(null)
  const [form, setForm] = useState<AccountInput>(EMPTY)
  const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounts'] })

  const groupedMap = new Map<string, AccountRow[]>()
  for (const row of data ?? []) {
    const key = row.category || '未分类'
    if (!groupedMap.has(key)) groupedMap.set(key, [])
    groupedMap.get(key)!.push(row)
  }
  const grouped = Array.from(groupedMap.entries())

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) return updateAccount({ data: { ...form, id: editing.id } })
      return createAccount({ data: form })
    },
    onSuccess: () => {
      toast.success(editing ? '已更新' : '已添加')
      setOpen(false)
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAccount({ data: { id } }),
    onSuccess: () => {
      toast.success('已删除')
      invalidate()
    },
  })

  function openCreate(category = '测试账号') {
    setEditing(null)
    setForm({ ...EMPTY, category })
    setOpen(true)
  }
  function openEdit(row: AccountRow) {
    setEditing(row)
    setForm({
      category: row.category,
      account: row.account,
      password: row.password,
      detail: row.detail,
    })
    setOpen(true)
  }

  return (
    <div className="rise-in space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="island-kicker">Accounts</p>
          <h1 className="display-title mt-1 text-2xl font-bold text-foreground">
            账号体系
          </h1>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="size-4" />
          新增账号
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={`skeleton-group-${g}`} className="space-y-3">
              <Skeleton className="h-5 w-24" />
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((__, i) => (
                  <div
                    key={`skeleton-${g}-${i}`}
                    className="feature-card rounded-2xl border border-border p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                      <div className="flex gap-1">
                        <Skeleton className="size-8 rounded-md" />
                        <Skeleton className="size-8 rounded-md" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {!isLoading && grouped.length === 0 && (
        <div className="island-shell rounded-2xl p-10 text-center text-muted-foreground">
          还没有账号，点击右上角「新增账号」开始。
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([category, rows]) => (
          <div key={category} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                {category}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => openCreate(category)}
              >
                <Plus className="size-4" />
                添加
              </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="feature-card rounded-2xl border border-border p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <button
                        className="flex items-center gap-1.5 font-medium text-foreground hover:text-[var(--lagoon-deep)]"
                        onClick={() => copy(row.account, '账号')}
                        title="点击复制账号"
                      >
                        {row.account}
                        <Copy className="size-3.5 opacity-50" />
                      </button>
                      <button
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--lagoon-deep)]"
                        onClick={() => copy(row.password, '密码')}
                        title="点击复制密码"
                      >
                        密码：{row.password || '—'}
                        {row.password && <Copy className="size-3 opacity-50" />}
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(row)}
                      >
                        <Trash2 className="size-4 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                  {row.detail && (
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-[#1d2e45] p-3 text-xs leading-relaxed text-[#e8efff]">
                      <code>{row.detail}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑账号' : '新增账号'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate()
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="category">分类</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  placeholder="测试账号"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account">账号</Label>
                <Input
                  id="account"
                  required
                  value={form.account}
                  onChange={(e) =>
                    setForm({ ...form, account: e.target.value })
                  }
                  placeholder="casper01@mico.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="123456"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail">详细信息（可粘贴 JSON）</Label>
              <Textarea
                id="detail"
                value={form.detail}
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
                rows={8}
                className="font-mono text-xs"
                placeholder={
                  '{\n  "userId": 1100028993,\n  "name": "casper"\n}'
                }
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除账号"
        description={
          deleteTarget
            ? `确定删除「${deleteTarget.account}」？此操作不可撤销。`
            : ''
        }
        confirmText="删除"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
