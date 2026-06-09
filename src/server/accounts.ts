import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { accountEntries } from '../db/schema'
import { requireUserId } from '../lib/server/auth-utils'

export type AccountInput = {
  category: string
  account: string
  password: string
  detail: string
}

export const listAccounts = createServerFn({ method: 'GET' }).handler(
  async () => {
    const userId = await requireUserId()
    const db = getDb()
    return db
      .select()
      .from(accountEntries)
      .where(eq(accountEntries.userId, userId))
      .orderBy(
        asc(accountEntries.category),
        asc(accountEntries.sortOrder),
        asc(accountEntries.createdAt),
      )
  },
)

export const createAccount = createServerFn({ method: 'POST' })
  .validator((data: AccountInput) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const [row] = await db
      .insert(accountEntries)
      .values({ ...data, userId })
      .returning()
    return row
  })

export const updateAccount = createServerFn({ method: 'POST' })
  .validator((data: AccountInput & { id: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...rest } = data
    const db = getDb()
    const [row] = await db
      .update(accountEntries)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(accountEntries.id, id), eq(accountEntries.userId, userId)))
      .returning()
    return row
  })

export const deleteAccount = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .delete(accountEntries)
      .where(
        and(eq(accountEntries.id, data.id), eq(accountEntries.userId, userId)),
      )
    return { ok: true }
  })
