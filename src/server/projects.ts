import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { projects } from '../db/schema'
import { requireUserId } from '../lib/server/auth-utils'

export type ProjectStatus =
  | 'todo'
  | 'developing'
  | 'testing'
  | 'deploying'
  | 'done'

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
