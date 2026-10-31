import { and, desc, eq, inArray } from 'drizzle-orm'

import { EXIT, ParloError } from '../errors'
import type { CallerKey, Vendor } from '../identity'
import type { Access, ColleagueVendor } from '../runners/types'
import type { Db } from './db'
import { agents, type Message, messages, type Thread, type ThreadStatus, threads } from './schema'
import { reapDeadRunners } from './threads'

export interface ThreadSummary {
  id: number
  vendor: Vendor
  status: ThreadStatus
  access: Access
  messageCount: number
  lastAt: Date
  firstAsk: string
  failure: string | null
}

/** The threads in the caller's tree: everything its root, and anyone under it, started. */
export function listThreads(db: Db, caller: CallerKey): ThreadSummary[] {
  reapDeadRunners(db)
  const me = db.select().from(agents)
    .where(and(eq(agents.vendor, caller.vendor), eq(agents.vendorSessionId, caller.vendorSessionId))).get()
  if (!me) return []
  const rows = db.select({ thread: threads, vendor: agents.vendor }).from(threads)
    .innerJoin(agents, eq(agents.id, threads.colleagueId))
    .where(eq(agents.rootId, me.rootId ?? me.id)).orderBy(threads.id).all()
  if (rows.length === 0) return []
  const all = db.select().from(messages).where(inArray(messages.threadId, rows.map(row => row.thread.id))).orderBy(messages.id).all()
  return rows.map(({ thread, vendor }) => {
    const own = all.filter(message => message.threadId === thread.id)
    return {
      id: thread.id, vendor, status: thread.status, access: thread.access, messageCount: own.length,
      lastAt: own.at(-1)?.createdAt ?? thread.createdAt, firstAsk: own[0]?.body ?? '', failure: thread.failure,
    }
  })
}

export interface ThreadDetail {
  thread: Thread
  vendor: Vendor
  messages: Array<Message & { fromColleague: boolean }>
}

export function getThread(db: Db, threadId: number): ThreadDetail {
  reapDeadRunners(db)
  const row = db.select({ thread: threads, vendor: agents.vendor }).from(threads)
    .innerJoin(agents, eq(agents.id, threads.colleagueId)).where(eq(threads.id, threadId)).get()
  if (!row) {
    throw new ParloError(`parlo: there is no thread ${threadId}. List yours with: parlo threads`, EXIT.usage)
  }
  const list = db.select().from(messages).where(eq(messages.threadId, threadId)).orderBy(messages.id).all()
  return { thread: row.thread, vendor: row.vendor, messages: list.map(message => ({ ...message, fromColleague: message.fromId === row.thread.colleagueId })) }
}

export interface RunPlan {
  vendor: ColleagueVendor
  colleagueAgentId: number
  callerVendor: Vendor
  /** The colleague's session to continue; null on the first ask of a thread. */
  resume: string | null
  access: Access
  cwd: string
  /** The ask this turn answers: the caller's latest message. */
  body: string
  deadlineAt: Date
}

/** What the runner of a thread's current turn needs. Called right after `beginAsk` recorded that turn. */
export function runPlan(db: Db, threadId: number): RunPlan {
  const thread = db.select().from(threads).where(eq(threads.id, threadId)).get()!
  const colleague = db.select().from(agents).where(eq(agents.id, thread.colleagueId)).get()!
  const caller = db.select().from(agents).where(eq(agents.id, thread.callerId)).get()!
  const ask = db.select().from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.fromId, thread.callerId)))
    .orderBy(desc(messages.id)).get()!
  return {
    // A colleague row is only ever inserted with a ColleagueVendor (startThread).
    vendor: colleague.vendor as ColleagueVendor,
    colleagueAgentId: colleague.id,
    callerVendor: caller.vendor,
    resume: colleague.vendorSessionId,
    access: thread.access,
    cwd: colleague.cwd,
    body: ask.body,
    deadlineAt: thread.deadlineAt,
  }
}

/** A running thread and every running thread under its colleague: what `parlo stop --thread` stops. */
export function runningSubtree(db: Db, threadId: number): Thread[] {
  reapDeadRunners(db)
  const start = db.select().from(threads).where(eq(threads.id, threadId)).get()
  if (!start) {
    throw new ParloError(`parlo: there is no thread ${threadId}. List yours with: parlo threads`, EXIT.usage)
  }
  const agentIds = [start.colleagueId]
  for (let frontier = [start.colleagueId]; frontier.length > 0;) {
    frontier = db.select({ id: agents.id }).from(agents).where(inArray(agents.parentId, frontier)).all().map(row => row.id)
    agentIds.push(...frontier)
  }
  const under = db.select().from(threads).where(and(inArray(threads.callerId, agentIds), eq(threads.status, 'running'))).all()
  return start.status === 'running' ? [start, ...under] : under
}
