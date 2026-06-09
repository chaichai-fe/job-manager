import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from '../../server/projects'
import type { ProjectInput, ProjectStatus } from '../../server/projects'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { ConfirmDialog } from '../../components/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'

export const Route = createFileRoute('/_authed/projects')({
  component: ProjectsPage,
})

type ProjectRow = ProjectInput & { id: string }

const STATUS: Record<ProjectStatus, { label: string; className: string }> = {
  todo: {
    label: '待开发',
    className: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
  },
  developing: {
    label: '开发中',
    className: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  },
  testing: {
    label: '测试中',
    className: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  },
  deploying: {
    label: '部署测试',
    className: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  },
  done: {
    label: '已完成',
    className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  },
}

const EMPTY: ProjectInput = {
  requirement: '',
  project: '',
  branch: '',
  status: 'todo',
  note: '',
}

function ProjectsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects(),
  })

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectRow | null>(null)
  const [form, setForm] = useState<ProjectInput>(EMPTY)
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['projects'] })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return updateProject({ data: { ...form, id: editing.id } })
      }
      return createProject({ data: form })
    },
    onSuccess: () => {
      toast.success(editing ? '已更新' : '已添加')
      setOpen(false)
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject({ data: { id } }),
    onSuccess: () => {
      toast.success('已删除')
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setOpen(true)
  }

  function openEdit(row: ProjectRow) {
    setEditing(row)
    setForm({
      requirement: row.requirement,
      project: row.project,
      branch: row.branch,
      status: row.status,
      note: row.note,
    })
    setOpen(true)
  }

  return (
    <div className="rise-in space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="island-kicker">Projects</p>
          <h1 className="display-title mt-1 text-2xl font-bold text-foreground">
            项目
          </h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              新增需求
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? '编辑项目' : '新增项目'}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                saveMutation.mutate()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="requirement">需求</Label>
                <Input
                  id="requirement"
                  required
                  value={form.requirement}
                  onChange={(e) =>
                    setForm({ ...form, requirement: e.target.value })
                  }
                  placeholder="例如：Lite包 Kimy"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="project">项目</Label>
                  <Input
                    id="project"
                    value={form.project}
                    onChange={(e) =>
                      setForm({ ...form, project: e.target.value })
                    }
                    placeholder="dashboard"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="branch">分支</Label>
                  <Input
                    id="branch"
                    value={form.branch}
                    onChange={(e) =>
                      setForm({ ...form, branch: e.target.value })
                    }
                    placeholder="feat/xxx"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as ProjectStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>
                        {val.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note">备注</Label>
                <Textarea
                  id="note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="接口文档、说明等"
                  rows={3}
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
      </div>

      <div className="island-shell overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[26%]">需求</TableHead>
              <TableHead>项目</TableHead>
              <TableHead>分支</TableHead>
              <TableHead className="w-[110px]">状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="w-[88px] pr-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-3/4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-2/3" />
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Skeleton className="size-8 rounded-md" />
                      <Skeleton className="size-8 rounded-md" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  还没有项目，点击右上角「新增需求」开始。
                </TableCell>
              </TableRow>
            )}
            {data?.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium text-foreground">
                  {row.requirement}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.project || '—'}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.branch || '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={STATUS[row.status].className}
                  >
                    {STATUS[row.status].label}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[260px] whitespace-pre-wrap text-sm text-muted-foreground">
                  {row.note || '—'}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(row)}
                      title="编辑"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-rose-500 hover:text-rose-500"
                      onClick={() => setDeleteTarget(row)}
                      title="删除"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除需求"
        description={
          deleteTarget
            ? `确定删除「${deleteTarget.requirement}」？此操作不可撤销。`
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
