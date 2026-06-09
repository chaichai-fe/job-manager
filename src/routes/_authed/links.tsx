import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  deleteLinkGroup,
  listLinks,
  reorderLinkGroups,
  saveLinkGroup,
} from '../../server/links'
import type { LinkEnv, LinkInput, LinkKind } from '../../server/links'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { ConfirmDialog } from '../../components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

export const Route = createFileRoute('/_authed/links')({
  component: LinksPage,
})

type LinkRow = LinkInput & { id: string }

const KIND_LABEL: Record<LinkKind, string> = {
  gitlab: 'Gitlab',
  jenkins: 'Jenkins',
  other: '其他',
}
const KIND_CLASS: Record<LinkKind, string> = {
  gitlab: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  jenkins: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  other: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}
const ENV_LABEL: Record<LinkEnv, string> = {
  test: 'Test',
  prod: 'Prod',
  none: '',
}

type GroupForm = {
  originalGroupName: string
  groupName: string
  gitlabUrl: string
  jenkinsTestUrl: string
  jenkinsProdUrl: string
}

const EMPTY_FORM: GroupForm = {
  originalGroupName: '',
  groupName: '',
  gitlabUrl: '',
  jenkinsTestUrl: '',
  jenkinsProdUrl: '',
}

function rowsToForm(groupName: string, rows: LinkRow[]): GroupForm {
  const find = (kind: LinkKind, env: LinkEnv) =>
    rows.find((r) => r.kind === kind && r.env === env)?.url ?? ''
  return {
    originalGroupName: groupName,
    groupName,
    gitlabUrl: find('gitlab', 'none'),
    jenkinsTestUrl: find('jenkins', 'test'),
    jenkinsProdUrl: find('jenkins', 'prod'),
  }
}

// 组内链接的固定展示顺序：Gitlab → Jenkins Test → Jenkins Prod → 其他
function rowRank(row: LinkRow) {
  if (row.kind === 'gitlab') return 0
  if (row.kind === 'jenkins' && row.env === 'test') return 1
  if (row.kind === 'jenkins' && row.env === 'prod') return 2
  return 3
}

function SortableCard({
  groupName,
  rows,
  onEdit,
  onDelete,
}: {
  groupName: string
  rows: LinkRow[]
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: groupName })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const sortedRows = [...rows].sort((a, b) => rowRank(a) - rowRank(b))

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`island-shell rounded-2xl p-5 ${
        isDragging ? 'z-10 opacity-80 shadow-lg' : ''
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            className="-ml-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="拖拽排序"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <h2 className="truncate text-base font-semibold text-foreground">
            {groupName}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="text-muted-foreground"
            aria-label="编辑"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-rose-500 hover:text-rose-500"
            aria-label="删除"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {sortedRows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 py-2.5">
            <Badge variant="outline" className={KIND_CLASS[row.kind]}>
              {KIND_LABEL[row.kind]}
            </Badge>
            {row.env !== 'none' && (
              <Badge variant="secondary" className="text-xs">
                {ENV_LABEL[row.env]}
              </Badge>
            )}
            <span className="min-w-0 flex-1">
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium"
              >
                {row.label}
                <ExternalLink className="size-3.5 opacity-60" />
              </a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LinksPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['links'],
    queryFn: () => listLinks(),
  })

  const [open, setOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['links'] })

  const groupMap = new Map<string, LinkRow[]>()
  for (const row of data ?? []) {
    const key = row.groupName || '未分组'
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(row)
  }

  const [order, setOrder] = useState<string[]>([])
  useEffect(() => {
    const names = Array.from(groupMap.keys())
    setOrder((prev) => {
      const present = new Set(names)
      const kept = prev.filter((n) => present.has(n))
      const added = names.filter((n) => !kept.includes(n))
      const next = [...kept, ...added]
      const same =
        next.length === prev.length && next.every((n, i) => n === prev[i])
      return same ? prev : next
    })
  }, [groupMap])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const reorderMutation = useMutation({
    mutationFn: (orderedGroupNames: Array<string>) =>
      reorderLinkGroups({ data: { orderedGroupNames } }),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : '排序失败')
      invalidate()
    },
  })

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrder((items) => {
      const from = items.indexOf(active.id as string)
      const to = items.indexOf(over.id as string)
      if (from === -1 || to === -1) return items
      const next = arrayMove(items, from, to)
      reorderMutation.mutate(next)
      return next
    })
  }

  const saveMutation = useMutation({
    mutationFn: async () =>
      saveLinkGroup({
        data: {
          originalGroupName: isEditing ? form.originalGroupName : undefined,
          groupName: form.groupName,
          gitlabUrl: form.gitlabUrl,
          jenkinsTestUrl: form.jenkinsTestUrl,
          jenkinsProdUrl: form.jenkinsProdUrl,
        },
      }),
    onSuccess: () => {
      toast.success(isEditing ? '已更新' : '已添加')
      setOpen(false)
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '保存失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (groupName: string) => deleteLinkGroup({ data: { groupName } }),
    onSuccess: () => {
      toast.success('已删除')
      invalidate()
    },
  })

  function openCreate() {
    setIsEditing(false)
    setForm(EMPTY_FORM)
    setOpen(true)
  }
  function openEditGroup(groupName: string, rows: LinkRow[]) {
    setIsEditing(true)
    setForm(rowsToForm(groupName, rows))
    setOpen(true)
  }

  return (
    <div className="rise-in space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="island-kicker">Repositories</p>
          <h1 className="display-title mt-1 text-2xl font-bold text-foreground">
            Gitlab &amp; Jenkins
          </h1>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="size-4" />
          新增项目
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="island-shell rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="size-6 rounded-md" />
              </div>
              <div className="mt-5 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!isLoading && order.length === 0 && (
        <div className="island-shell rounded-2xl p-10 text-center text-muted-foreground">
          还没有项目，点击右上角「新增项目」开始。
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {order.map((groupName) => {
              const rows = groupMap.get(groupName)
              if (!rows) return null
              return (
                <SortableCard
                  key={groupName}
                  groupName={groupName}
                  rows={rows}
                  onEdit={() => openEditGroup(groupName, rows)}
                  onDelete={() => setDeleteTarget(groupName)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-6 p-7">
          <DialogHeader>
            <DialogTitle>{isEditing ? '编辑项目' : '新增项目'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="groupName">项目名</Label>
              <Input
                id="groupName"
                required
                value={form.groupName}
                onChange={(e) =>
                  setForm({ ...form, groupName: e.target.value })
                }
                placeholder="mico-web-app-next（vue3）"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gitlabUrl">Gitlab 地址</Label>
              <Input
                id="gitlabUrl"
                type="url"
                value={form.gitlabUrl}
                onChange={(e) =>
                  setForm({ ...form, gitlabUrl: e.target.value })
                }
                placeholder="https://gitlab.example.com/group/repo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jenkinsTestUrl">Jenkins 地址（Test）</Label>
              <Input
                id="jenkinsTestUrl"
                type="url"
                value={form.jenkinsTestUrl}
                onChange={(e) =>
                  setForm({ ...form, jenkinsTestUrl: e.target.value })
                }
                placeholder="https://jenkins.example.com/job/...-test"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jenkinsProdUrl">Jenkins 地址（Prod）</Label>
              <Input
                id="jenkinsProdUrl"
                type="url"
                value={form.jenkinsProdUrl}
                onChange={(e) =>
                  setForm({ ...form, jenkinsProdUrl: e.target.value })
                }
                placeholder="https://jenkins.example.com/job/...-prod"
              />
            </div>
            <DialogFooter className="pt-2">
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
        title="删除项目"
        description={
          deleteTarget
            ? `确定删除项目「${deleteTarget}」及其所有链接？此操作不可撤销。`
            : ''
        }
        confirmText="删除"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
