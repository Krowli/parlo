import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vendor: text('vendor', { enum: ['claude', 'codex', 'shell'] }).notNull(),
  /** A root's CLAUDE_CODE_SESSION_ID / CODEX_THREAD_ID; a colleague's own session once its stream names it. */
  vendorSessionId: text('vendor_session_id'),
  /** The agent that started this one; null for a root. A plain column: drizzle can't type a self-reference. */
  parentId: integer('parent_id'),
  /** The root of this agent's tree; null for the root itself. */
  rootId: integer('root_id'),
  depth: integer('depth').notNull(),
  cwd: text('cwd').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, table => ({
  bySession: index('agents_vendor_session_idx').on(table.vendor, table.vendorSessionId),
  byParent: index('agents_parent_idx').on(table.parentId),
  byRoot: index('agents_root_idx').on(table.rootId),
}))

export const threads = sqliteTable('threads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  callerId: integer('caller_id').notNull().references(() => agents.id),
  colleagueId: integer('colleague_id').notNull().references(() => agents.id),
  access: text('access', { enum: ['read', 'write', 'worktree'] }).notNull(),
  status: text('status', { enum: ['running', 'idle', 'failed', 'stopped'] }).notNull(),
  failure: text('failure'),
  /** The parlo process driving the current turn; a running thread whose runner is gone is reaped. */
  runnerPid: integer('runner_pid'),
  /** The colleague CLI's process group leader, for `parlo stop`. */
  colleaguePid: integer('colleague_pid'),
  deadlineAt: integer('deadline_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, table => ({
  byCaller: index('threads_caller_status_idx').on(table.callerId, table.status),
  byStatus: index('threads_status_idx').on(table.status),
}))

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('thread_id').notNull().references(() => threads.id),
  fromId: integer('from_id').notNull().references(() => agents.id),
  toId: integer('to_id').notNull().references(() => agents.id),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, table => ({
  byThread: index('messages_thread_idx').on(table.threadId),
}))

export type Agent = typeof agents.$inferSelect
export type Thread = typeof threads.$inferSelect
export type Message = typeof messages.$inferSelect
export type ThreadStatus = Thread['status']
