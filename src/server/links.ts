import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { repoLinks } from '../db/schema'
import { requireUserId } from '../lib/server/auth-utils'

export type LinkKind = 'gitlab' | 'jenkins' | 'other'
export type LinkEnv = 'test' | 'prod' | 'none'

export type LinkInput = {
  groupName: string
  kind: LinkKind
  env: LinkEnv
  label: string
  url: string
}

export const listLinks = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await requireUserId()
  const db = getDb()
  return db
    .select()
    .from(repoLinks)
    .where(eq(repoLinks.userId, userId))
    .orderBy(
      asc(repoLinks.sortOrder),
      asc(repoLinks.groupName),
      asc(repoLinks.createdAt),
    )
})

export const createLink = createServerFn({ method: 'POST' })
  .validator((data: LinkInput) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const [row] = await db
      .insert(repoLinks)
      .values({ ...data, userId })
      .returning()
    return row
  })

export const updateLink = createServerFn({ method: 'POST' })
  .validator((data: LinkInput & { id: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const { id, ...rest } = data
    const db = getDb()
    const [row] = await db
      .update(repoLinks)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(repoLinks.id, id), eq(repoLinks.userId, userId)))
      .returning()
    return row
  })

export const deleteLink = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .delete(repoLinks)
      .where(and(eq(repoLinks.id, data.id), eq(repoLinks.userId, userId)))
    return { ok: true }
  })

export const deleteLinkGroup = createServerFn({ method: 'POST' })
  .validator((data: { groupName: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .delete(repoLinks)
      .where(
        and(
          eq(repoLinks.userId, userId),
          eq(repoLinks.groupName, data.groupName),
        ),
      )
    return { ok: true }
  })

/**
 * 按项目（仓库）保存一组链接：项目名 + Gitlab 地址 + Jenkins test / prod 地址。
 * 保存时会先清掉该项目下旧的链接，再写入当前填写的内容（空地址会被忽略）。
 */
export type LinkGroupInput = {
  /** 编辑时的原项目名，用于改名后正确清理旧数据 */
  originalGroupName?: string
  groupName: string
  gitlabUrl: string
  jenkinsTestUrl: string
  jenkinsProdUrl: string
}

export const saveLinkGroup = createServerFn({ method: 'POST' })
  .validator((data: LinkGroupInput) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const groupName = data.groupName.trim()
    if (!groupName) throw new Error('项目名不能为空')

    const existing = await db
      .select({
        sortOrder: repoLinks.sortOrder,
        groupName: repoLinks.groupName,
      })
      .from(repoLinks)
      .where(eq(repoLinks.userId, userId))

    // 编辑时复用该项目原有的组序号；新增时排到末尾
    const sourceName = data.originalGroupName?.trim() || groupName
    const sameGroup = existing.find((r) => r.groupName === sourceName)
    const groupOrder = sameGroup
      ? sameGroup.sortOrder
      : existing.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1

    const targets = [data.originalGroupName?.trim(), groupName].filter(
      (g): g is string => Boolean(g),
    )
    for (const g of Array.from(new Set(targets))) {
      await db
        .delete(repoLinks)
        .where(and(eq(repoLinks.userId, userId), eq(repoLinks.groupName, g)))
    }

    const rows: Array<{
      userId: string
      groupName: string
      kind: LinkKind
      env: LinkEnv
      label: string
      url: string
      sortOrder: number
    }> = []
    const push = (kind: LinkKind, env: LinkEnv, label: string, url: string) => {
      const u = url.trim()
      if (!u) return
      // 同一项目的所有链接共享组序号，用于卡片整体排序
      rows.push({
        userId,
        groupName,
        kind,
        env,
        label,
        url: u,
        sortOrder: groupOrder,
      })
    }
    push('gitlab', 'none', 'Gitlab', data.gitlabUrl)
    push('jenkins', 'test', 'Jenkins Test', data.jenkinsTestUrl)
    push('jenkins', 'prod', 'Jenkins Prod', data.jenkinsProdUrl)

    if (rows.length) await db.insert(repoLinks).values(rows)
    return { ok: true, count: rows.length }
  })

/**
 * 按项目卡片的新顺序持久化排序：传入排好序的项目名数组，
 * 数组下标即为各项目下所有链接的 sortOrder。
 */
export const reorderLinkGroups = createServerFn({ method: 'POST' })
  .validator((data: { orderedGroupNames: Array<string> }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    for (let i = 0; i < data.orderedGroupNames.length; i++) {
      await db
        .update(repoLinks)
        .set({ sortOrder: i })
        .where(
          and(
            eq(repoLinks.userId, userId),
            eq(repoLinks.groupName, data.orderedGroupNames[i]),
          ),
        )
    }
    return { ok: true }
  })
