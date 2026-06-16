import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { projectStatuses, projects } from '../db/schema'
import { requireUserId } from '../lib/server/auth-utils'

export type ProjectStatusInput = {
  label: string
  color: string
}

export type ProjectStatusRow = {
  id: string
  key: string
  label: string
  color: string
  sortOrder: number
}

/** 首次访问时为用户写入的默认状态列。 */
const DEFAULT_STATUSES: Array<{ key: string; label: string; color: string }> = [
  { key: 'todo', label: '待开发', color: 'rose' },
  { key: 'developing', label: '开发中', color: 'sky' },
  { key: 'testing', label: '测试中', color: 'violet' },
  { key: 'done', label: '已完成', color: 'emerald' },
]

async function seedDefaults(db: ReturnType<typeof getDb>, userId: string) {
  await db.insert(projectStatuses).values(
    DEFAULT_STATUSES.map((s, i) => ({
      userId,
      key: s.key,
      label: s.label,
      color: s.color,
      sortOrder: i,
    })),
  )
}

export const listProjectStatuses = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const db = getDb()
    let rows = await db
      .select()
      .from(projectStatuses)
      .where(eq(projectStatuses.userId, userId))
      .orderBy(asc(projectStatuses.sortOrder), asc(projectStatuses.createdAt))

    if (rows.length === 0) {
      await seedDefaults(db, userId)
      rows = await db
        .select()
        .from(projectStatuses)
        .where(eq(projectStatuses.userId, userId))
        .orderBy(asc(projectStatuses.sortOrder), asc(projectStatuses.createdAt))
    }

    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      label: r.label,
      color: r.color,
      sortOrder: r.sortOrder,
    })) satisfies Array<ProjectStatusRow>
  },
)

export const createProjectStatus = createServerFn({ method: 'POST' })
  .validator((data: ProjectStatusInput) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const existing = await db
      .select({ sortOrder: projectStatuses.sortOrder })
      .from(projectStatuses)
      .where(eq(projectStatuses.userId, userId))
    const nextOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0)
    const [row] = await db
      .insert(projectStatuses)
      .values({
        userId,
        key: crypto.randomUUID(),
        label: data.label,
        color: data.color,
        sortOrder: nextOrder,
      })
      .returning()
    return row
  })

export const updateProjectStatus = createServerFn({ method: 'POST' })
  .validator((data: ProjectStatusInput & { id: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const [row] = await db
      .update(projectStatuses)
      .set({ label: data.label, color: data.color, updatedAt: new Date() })
      .where(
        and(
          eq(projectStatuses.id, data.id),
          eq(projectStatuses.userId, userId),
        ),
      )
      .returning()
    return row
  })

export const deleteProjectStatus = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()

    const all = await db
      .select()
      .from(projectStatuses)
      .where(eq(projectStatuses.userId, userId))
      .orderBy(asc(projectStatuses.sortOrder))

    if (all.length <= 1) {
      throw new Error('至少保留一个状态')
    }

    const target = all.find((s) => s.id === data.id)
    if (!target) return { ok: true }

    // 删除前把使用该状态的需求迁移到第一个剩余状态
    const fallback = all.find((s) => s.id !== data.id)
    if (fallback) {
      await db
        .update(projects)
        .set({ status: fallback.key, updatedAt: new Date() })
        .where(
          and(
            eq(projects.userId, userId),
            eq(projects.status, target.key),
          ),
        )
    }

    await db
      .delete(projectStatuses)
      .where(
        and(
          eq(projectStatuses.id, data.id),
          eq(projectStatuses.userId, userId),
        ),
      )
    return { ok: true }
  })

/** 按给定顺序重写状态列的 sortOrder。 */
export const reorderProjectStatuses = createServerFn({ method: 'POST' })
  .validator((data: { orderedIds: Array<string> }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    for (let i = 0; i < data.orderedIds.length; i++) {
      await db
        .update(projectStatuses)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(projectStatuses.id, data.orderedIds[i]),
            eq(projectStatuses.userId, userId),
          ),
        )
    }
    return { ok: true }
  })
