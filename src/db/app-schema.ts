import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * 开发中项目：需求 / 项目 / 分支 / 状态 / 备注
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    requirement: text('requirement').notNull(),
    project: text('project').default('').notNull(),
    branch: text('branch').default('').notNull(),
    status: text('status', {
      enum: ['todo', 'developing', 'testing', 'deploying', 'done'],
    })
      .default('todo')
      .notNull(),
    note: text('note').default('').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => [index('projects_user_idx').on(t.userId)],
)

/**
 * Gitlab & Jenkins 链接：按仓库分组（groupName），每条是一个具名链接。
 * kind: gitlab | jenkins | other  env: test | prod | none
 */
export const repoLinks = sqliteTable(
  'repo_links',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    groupName: text('group_name').notNull(),
    kind: text('kind', { enum: ['gitlab', 'jenkins', 'other'] })
      .default('gitlab')
      .notNull(),
    env: text('env', { enum: ['test', 'prod', 'none'] })
      .default('none')
      .notNull(),
    label: text('label').notNull(),
    url: text('url').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => [index('repo_links_user_idx').on(t.userId)],
)

/**
 * 账号体系：测试账号 / 密码 / 详细信息（JSON 文本）
 */
export const accountEntries = sqliteTable(
  'account_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    category: text('category').default('测试账号').notNull(),
    account: text('account').notNull(),
    password: text('password').default('').notNull(),
    detail: text('detail').default('').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (t) => [index('account_entries_user_idx').on(t.userId)],
)
