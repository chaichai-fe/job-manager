import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { projects } from '../db/schema'
import { requireUserId } from '../lib/server/auth-utils'

/** 状态值现由 project_statuses 维护，这里只是一个状态 key 字符串。 */
export type ProjectStatus = string

export type ProjectInput = {
  requirement: string
  project: string
  branch: string
  status: ProjectStatus
  note: string
}

export const listProjects = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const db = getDb()
    return db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(asc(projects.sortOrder), asc(projects.createdAt))
  },
)

export const createProject = createServerFn({ method: 'POST' })
  .validator((data: ProjectInput) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const [row] = await db
      .insert(projects)
      .values({ ...data, userId })
      .returning()
    return row
  })

export const updateProject = createServerFn({ method: 'POST' })
  .validator((data: ProjectInput & { id: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...rest } = data
    const db = getDb()
    const [row] = await db
      .update(projects)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning()
    return row
  })

export const deleteProject = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .delete(projects)
      .where(and(eq(projects.id, data.id), eq(projects.userId, userId)))
    return { ok: true }
  })

/**
 * 看板拖拽：把某条需求移动到目标状态列，并按目标列的新顺序重写 sortOrder。
 * orderedIds 为目标列从上到下的全部项目 id（含被移动的那条）。
 */
export const moveProject = createServerFn({ method: 'POST' })
  .validator(
    (data: { id: string; status: ProjectStatus; orderedIds: Array<string> }) =>
      data,
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .update(projects)
      .set({ status: data.status, updatedAt: new Date() })
      .where(and(eq(projects.id, data.id), eq(projects.userId, userId)))
    for (let i = 0; i < data.orderedIds.length; i++) {
      await db
        .update(projects)
        .set({ sortOrder: i })
        .where(
          and(
            eq(projects.id, data.orderedIds[i]),
            eq(projects.userId, userId),
          ),
        )
    }
    return { ok: true }
  })
