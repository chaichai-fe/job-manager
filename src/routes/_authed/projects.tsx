import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  KanbanSquare,
  Pencil,
  Plus,
  Settings2,
  Table2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createProject,
  deleteProject,
  listProjects,
  moveProject,
  updateProject,
} from '../../server/projects'
import type { ProjectInput, ProjectStatus } from '../../server/projects'
import {
  createProjectStatus,
  deleteProjectStatus,
  listProjectStatuses,
  reorderProjectStatuses,
  updateProjectStatus,
} from '../../server/project-statuses'
import type { ProjectStatusRow } from '../../server/project-statuses'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
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

type Board = Record<string, Array<ProjectRow> | undefined>

/**
 * 颜色调色板：状态只在后端存颜色名，前端在此映射成固定的 Tailwind 类。
 * 类名必须以字面量写出，Tailwind 才能在构建时收集到。
 */
const PALETTE: Record<string, { className: string; dot: string }> = {
  rose: {
    className: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
    dot: 'bg-rose-500',
  },
  sky: {
    className: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
    dot: 'bg-sky-500',
  },
  violet: {
    className: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
    dot: 'bg-violet-500',
  },
  emerald: {
    className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  amber: {
    className: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    dot: 'bg-amber-500',
  },
  blue: {
    className: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    dot: 'bg-blue-500',
  },
  pink: {
    className: 'bg-pink-500/15 text-pink-500 border-pink-500/30',
    dot: 'bg-pink-500',
  },
  orange: {
    className: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
    dot: 'bg-orange-500',
  },
  teal: {
    className: 'bg-teal-500/15 text-teal-500 border-teal-500/30',
    dot: 'bg-teal-500',
  },
  cyan: {
    className: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30',
    dot: 'bg-cyan-500',
  },
  fuchsia: {
    className: 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30',
    dot: 'bg-fuchsia-500',
  },
  slate: {
    className: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    dot: 'bg-slate-500',
  },
}

const PALETTE_KEYS = Object.keys(PALETTE)

function palette(color: string) {
  return PALETTE[color] ?? PALETTE.slate
}

type StatusMeta = { label: string; className: string; dot: string }

function statusMeta(
  map: Map<string, ProjectStatusRow>,
  key: string,
): StatusMeta {
  const found = map.get(key)
  const p = palette(found?.color ?? 'slate')
  return { label: found?.label ?? key, className: p.className, dot: p.dot }
}

function emptyBoard(keys: Array<string>): Board {
  const board: Board = {}
  for (const k of keys) board[k] = []
  return board
}

function buildBoard(rows: Array<ProjectRow>, keys: Array<string>): Board {
  const board = emptyBoard(keys)
  const fallback = keys[0]
  for (const row of rows) {
    const target = board[row.status] ? row.status : fallback
    const column = target ? board[target] : undefined
    if (column) column.push(row)
  }
  return board
}

const VIEW_KEY = 'projects-view'

function ProjectsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects(),
  })
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['project-statuses'],
    queryFn: () => listProjectStatuses(),
  })

  const statuses = statusData ?? []
  const statusKeys = statuses.map((s) => s.key)
  const statusMap = new Map(statuses.map((s) => [s.key, s]))

  const [view, setView] = useState<'board' | 'table'>('board')
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved === 'board' || saved === 'table') setView(saved)
  }, [])
  function changeView(v: string) {
    const next = v === 'table' ? 'table' : 'board'
    setView(next)
    localStorage.setItem(VIEW_KEY, next)
  }

  const [open, setOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectRow | null>(null)
  const [form, setForm] = useState<ProjectInput>({
    requirement: '',
    project: '',
    branch: '',
    status: 'todo',
    note: '',
  })
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

  const moveMutation = useMutation({
    mutationFn: (vars: {
      id: string
      status: ProjectStatus
      orderedIds: Array<string>
    }) => moveProject({ data: vars }),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : '移动失败')
      invalidate()
    },
  })

  function openCreate() {
    setEditing(null)
    setForm({
      requirement: '',
      project: '',
      branch: '',
      status: statusKeys[0] ?? 'todo',
      note: '',
    })
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="island-kicker">Projects</p>
          <h1 className="display-title mt-1 text-2xl font-bold text-foreground">
            项目
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={view} onValueChange={changeView}>
            <TabsList>
              <TabsTrigger value="board">
                <KanbanSquare className="size-4" />
                看板
              </TabsTrigger>
              <TabsTrigger value="table">
                <Table2 className="size-4" />
                表格
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" onClick={() => setManageOpen(true)}>
            <Settings2 className="size-4" />
            状态
          </Button>
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
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
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
      </div>

      {view === 'board' ? (
        <BoardView
          rows={(data as Array<ProjectRow> | undefined) ?? []}
          isLoading={isLoading || statusLoading}
          statuses={statuses}
          statusMap={statusMap}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          onMove={(vars) => moveMutation.mutate(vars)}
        />
      ) : (
        <TableView
          rows={(data as Array<ProjectRow> | undefined) ?? []}
          isLoading={isLoading || statusLoading}
          statusMap={statusMap}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      <StatusManagerDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        statuses={statuses}
        isLoading={statusLoading}
      />

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

function BoardView({
  rows,
  isLoading,
  statuses,
  statusMap,
  onEdit,
  onDelete,
  onMove,
}: {
  rows: Array<ProjectRow>
  isLoading: boolean
  statuses: Array<ProjectStatusRow>
  statusMap: Map<string, ProjectStatusRow>
  onEdit: (row: ProjectRow) => void
  onDelete: (row: ProjectRow) => void
  onMove: (vars: {
    id: string
    status: ProjectStatus
    orderedIds: Array<string>
  }) => void
}) {
  const statusKeys = statuses.map((s) => s.key)
  const [board, setBoard] = useState<Board>(() => emptyBoard(statusKeys))
  const boardRef = useRef<Board>(board)
  const [activeId, setActiveId] = useState<string | null>(null)
  const isDraggingRef = useRef(false)

  const setBoardSafe = (next: Board) => {
    boardRef.current = next
    setBoard(next)
  }

  const statusSignature = statusKeys.join('|')
  useEffect(() => {
    if (isDraggingRef.current) return
    setBoardSafe(buildBoard(rows, statusKeys))
  }, [rows, statusSignature])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function findColumn(id: string): string | undefined {
    if (id in board) return id
    return statusKeys.find((s) => board[s]?.some((c) => c.id === id))
  }

  function onDragStart(event: DragStartEvent) {
    isDraggingRef.current = true
    setActiveId(event.active.id as string)
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeCardId = active.id as string
    const overId = over.id as string
    const from = findColumn(activeCardId)
    const to = findColumn(overId)
    if (!from || !to || from === to) return

    const fromItems = boardRef.current[from]
    const toItems = boardRef.current[to]
    if (!fromItems || !toItems) return
    const moved = fromItems.find((c) => c.id === activeCardId)
    if (!moved) return
    let overIndex = toItems.findIndex((c) => c.id === overId)
    if (overIndex === -1) overIndex = toItems.length

    setBoardSafe({
      ...boardRef.current,
      [from]: fromItems.filter((c) => c.id !== activeCardId),
      [to]: [...toItems.slice(0, overIndex), moved, ...toItems.slice(overIndex)],
    })
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    isDraggingRef.current = false
    setActiveId(null)
    if (!over) return
    const activeCardId = active.id as string
    const overId = over.id as string
    const column = findColumn(activeCardId)
    if (!column) return

    let next = boardRef.current
    const overColumn = findColumn(overId)
    if (overColumn === column) {
      const items = next[column]
      if (items) {
        const from = items.findIndex((c) => c.id === activeCardId)
        const to = items.findIndex((c) => c.id === overId)
        if (from !== -1 && to !== -1 && from !== to) {
          next = { ...next, [column]: arrayMove(items, from, to) }
          setBoardSafe(next)
        }
      }
    }

    const nextColumn = next[column] ?? []
    const moved = rows.find((r) => r.id === activeCardId)
    const statusChanged = moved ? moved.status !== column : true
    const orderChanged =
      JSON.stringify(
        (buildBoard(rows, statusKeys)[column] ?? []).map((c) => c.id),
      ) !== JSON.stringify(nextColumn.map((c) => c.id))
    if (statusChanged || orderChanged) {
      onMove({
        id: activeCardId,
        status: column,
        orderedIds: nextColumn.map((c) => c.id),
      })
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  const total = statusKeys.reduce((n, s) => n + (board[s]?.length ?? 0), 0)
  if (total === 0) {
    return (
      <div className="island-shell rounded-2xl p-10 text-center text-muted-foreground">
        还没有项目，点击右上角「新增需求」开始。
      </div>
    )
  }

  const activeCard = activeId
    ? statusKeys.flatMap((s) => board[s] ?? []).find((c) => c.id === activeId)
    : null

  const columnCount = Math.min(Math.max(statusKeys.length, 1), 4)
  const gridCols =
    columnCount >= 4
      ? 'xl:grid-cols-4'
      : columnCount === 3
        ? 'xl:grid-cols-3'
        : columnCount === 2
          ? 'xl:grid-cols-2'
          : 'xl:grid-cols-1'

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${gridCols}`}>
        {statuses.map((status) => (
          <Column
            key={status.key}
            meta={statusMeta(statusMap, status.key)}
            items={board[status.key] ?? []}
            statusKey={status.key}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCard ? (
          <ProjectCard
            row={activeCard}
            overlay
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  meta,
  statusKey,
  items,
  onEdit,
  onDelete,
}: {
  meta: StatusMeta
  statusKey: string
  items: Array<ProjectRow>
  onEdit: (row: ProjectRow) => void
  onDelete: (row: ProjectRow) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: statusKey })

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={`size-2 rounded-full ${meta.dot}`} />
        <span className="text-sm font-semibold text-foreground">
          {meta.label}
        </span>
        <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[120px] flex-1 space-y-3 rounded-2xl p-2 transition-colors ${
          isOver ? 'bg-muted/60' : 'bg-muted/20'
        }`}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((row) => (
            <SortableProjectCard
              key={row.id}
              row={row}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground/60">
            拖拽到此
          </p>
        )}
      </div>
    </div>
  )
}

function SortableProjectCard({
  row,
  onEdit,
  onDelete,
}: {
  row: ProjectRow
  onEdit: (row: ProjectRow) => void
  onDelete: (row: ProjectRow) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProjectCard row={row} onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

function ProjectCard({
  row,
  overlay,
  onEdit,
  onDelete,
}: {
  row: ProjectRow
  overlay?: boolean
  onEdit: (row: ProjectRow) => void
  onDelete: (row: ProjectRow) => void
}) {
  return (
    <div
      className={`group island-shell cursor-grab rounded-xl p-3 active:cursor-grabbing ${
        overlay ? 'rotate-2 shadow-xl' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
          {row.requirement}
        </p>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onEdit(row)}
            title="编辑"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-rose-500 hover:text-rose-500"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(row)}
            title="删除"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {(row.project || row.branch) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {row.project && <span>{row.project}</span>}
          {row.branch && (
            <span className="inline-flex items-center gap-1 font-mono">
              <GitBranch className="size-3" />
              {row.branch}
            </span>
          )}
        </div>
      )}
      {row.note && (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground/80">
          {row.note}
        </p>
      )}
    </div>
  )
}

function TableView({
  rows,
  isLoading,
  statusMap,
  onEdit,
  onDelete,
}: {
  rows: Array<ProjectRow>
  isLoading: boolean
  statusMap: Map<string, ProjectStatusRow>
  onEdit: (row: ProjectRow) => void
  onDelete: (row: ProjectRow) => void
}) {
  return (
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
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center text-muted-foreground"
              >
                还没有项目，点击右上角「新增需求」开始。
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => {
            const meta = statusMeta(statusMap, row.status)
            return (
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
                  <Badge variant="outline" className={meta.className}>
                    {meta.label}
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
                      onClick={() => onEdit(row)}
                      title="编辑"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-rose-500 hover:text-rose-500"
                      onClick={() => onDelete(row)}
                      title="删除"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function StatusManagerDialog({
  open,
  onOpenChange,
  statuses,
  isLoading,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  statuses: Array<ProjectStatusRow>
  isLoading: boolean
}) {
  const qc = useQueryClient()
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('blue')

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['project-statuses'] })
    qc.invalidateQueries({ queryKey: ['projects'] })
  }

  const createMutation = useMutation({
    mutationFn: (vars: { label: string; color: string }) =>
      createProjectStatus({ data: vars }),
    onSuccess: () => {
      toast.success('已添加状态')
      setNewLabel('')
      refresh()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '添加失败'),
  })

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; label: string; color: string }) =>
      updateProjectStatus({ data: vars }),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProjectStatus({ data: { id } }),
    onSuccess: () => {
      toast.success('已删除状态')
      refresh()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: Array<string>) =>
      reorderProjectStatuses({ data: { orderedIds } }),
    onSuccess: () => refresh(),
    onError: (e) => toast.error(e instanceof Error ? e.message : '排序失败'),
  })

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= statuses.length) return
    const ids = statuses.map((s) => s.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(target, 0, moved)
    reorderMutation.mutate(ids)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>管理状态</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {isLoading && (
            <Skeleton className="h-12 w-full rounded-lg" />
          )}
          {statuses.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 p-2"
            >
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5"
                  disabled={i === 0 || reorderMutation.isPending}
                  onClick={() => move(i, -1)}
                  title="上移"
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5"
                  disabled={
                    i === statuses.length - 1 || reorderMutation.isPending
                  }
                  onClick={() => move(i, 1)}
                  title="下移"
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
              <ColorPicker
                value={s.color}
                onChange={(color) =>
                  updateMutation.mutate({ id: s.id, label: s.label, color })
                }
              />
              <Input
                className="h-9 flex-1"
                defaultValue={s.label}
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (label && label !== s.label) {
                    updateMutation.mutate({ id: s.id, label, color: s.color })
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-9 text-rose-500 hover:text-rose-500"
                disabled={statuses.length <= 1 || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(s.id)}
                title="删除"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <form
          className="flex items-center gap-2 border-t border-border/60 pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            const label = newLabel.trim()
            if (!label) return
            createMutation.mutate({ label, color: newColor })
          }}
        >
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Input
            className="h-9 flex-1"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="新增状态名称"
          />
          <Button type="submit" disabled={createMutation.isPending}>
            <Plus className="size-4" />
            添加
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[72px]">
        <span className={`size-3.5 rounded-full ${palette(value).dot}`} />
      </SelectTrigger>
      <SelectContent>
        {PALETTE_KEYS.map((c) => (
          <SelectItem key={c} value={c}>
            <span className="flex items-center gap-2">
              <span className={`size-3.5 rounded-full ${palette(c).dot}`} />
              {c}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
