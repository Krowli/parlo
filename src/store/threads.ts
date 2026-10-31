import { and, count, eq, inArray } from 'drizzle-orm'

import { EXIT, ParloError } from '../errors'
import type { CallerKey } from '../identity'
import { LIMITS } from '../limits'
import { isAlive, killGroup } from '../process'
import type { Access, ColleagueVendor, RunOutcome } from '../runners/types'
import type { Db } from './db'
import { type Agent, agents, messages, threads } from './schema'

export interface AskInput {
  caller: CallerKey
  cwd: string
  vendor: ColleagueVendor
  /** The thread to continue, or null to start one. */
  threadId: number | null
  /** The access the person asked for; null when no flag was given. */
  access: Access | null
  body: string
  runnerPid: number
  now: Date
}

export interface StartedAsk {
  threadId: number
  access: Access
}

const refuse = (message: string) => new ParloError(message, EXIT.refused)
const usage = (message: string) => new ParloError(message, EXIT.usage)

/**
 * Record one ask and enforce every limit, in one immediate transaction: two
 * agents asking at the same moment take turns, so a limit with one slot left
 * lets exactly one of them through.
 */
export function beginAsk(db: Db, input: AskInput): StartedAsk {
  const bytes = Buffer.byteLength(input.body, 'utf8')
  if (bytes > LIMITS.maxMessageBytes) {
    throw refuse(`parlo: the message is ${Math.ceil(bytes / 1024)} KiB; the limit is ${LIMITS.maxMessageBytes / 1024} KiB. Shorten it.`)
  }
  return db.transaction(tx => {
    reapDeadRunners(tx)
    const caller = findOrCreateCaller(tx, input)
    return input.threadId === null ? startThread(tx, caller, input) : continueThread(tx, caller, input.threadId, input)
  }, { behavior: 'immediate' })
}

function findOrCreateCaller(db: Db, input: AskInput): Agent {
  const found = db.select().from(agents)
    .where(and(eq(agents.vendor, input.caller.vendor), eq(agents.vendorSessionId, input.caller.vendorSessionId)))
    .get()
  if (found) return found
  return db.insert(agents).values({
    vendor: input.caller.vendor, vendorSessionId: input.caller.vendorSessionId, parentId: null, rootId: null, depth: 0, cwd: input.cwd, createdAt: input.now,
  }).returning().get()
}

function deadline(now: Date): Date {
  return new Date(now.getTime() + LIMITS.replyDeadlineMs)
}

function startThread(db: Db, caller: Agent, input: AskInput): StartedAsk {
  if (caller.depth + 1 > LIMITS.maxDepth) {
    throw refuse(`parlo: you are a colleague's colleague and can't start another (depth limit ${LIMITS.maxDepth}). Do it yourself, or say in your reply what is missing.`)
  }
  const live = db.select({ n: count() }).from(threads)
    .where(and(eq(threads.callerId, caller.id), eq(threads.status, 'running'))).get()!.n
  if (live >= LIMITS.maxLiveColleagues) {
    throw refuse(`parlo: you already have ${live} colleagues working (limit ${LIMITS.maxLiveColleagues}). Wait for one to answer (parlo threads) before asking another.`)
  }
  const access = input.access ?? 'read'
  const colleague = db.insert(agents).values({
    vendor: input.vendor, vendorSessionId: null, parentId: caller.id, rootId: caller.rootId ?? caller.id, depth: caller.depth + 1, cwd: input.cwd, createdAt: input.now,
  }).returning().get()
  const thread = db.insert(threads).values({
    callerId: caller.id, colleagueId: colleague.id, access, status: 'running', failure: null,
    runnerPid: input.runnerPid, colleaguePid: null, deadlineAt: deadline(input.now), createdAt: input.now,
  }).returning().get()
  db.insert(messages).values({ threadId: thread.id, fromId: caller.id, toId: colleague.id, body: input.body, createdAt: input.now }).run()
  return { threadId: thread.id, access }
}

function continueThread(db: Db, caller: Agent, threadId: number, input: AskInput): StartedAsk {
  const thread = db.select().from(threads).where(eq(threads.id, threadId)).get()
  if (!thread) {
    throw usage(`parlo: there is no thread ${threadId}. List yours with: parlo threads`)
  }
  if (thread.callerId !== caller.id) {
    throw refuse(`parlo: thread ${threadId} belongs to another agent; only the agent that started it can continue it.`)
  }
  const colleague = db.select().from(agents).where(eq(agents.id, thread.colleagueId)).get()!
  if (colleague.vendor !== input.vendor) {
    throw usage(`parlo: thread ${threadId} is with ${colleague.vendor}, not ${input.vendor}.`)
  }
  if (input.access !== null && input.access !== thread.access) {
    throw usage(`parlo: thread ${threadId} keeps the access it started with (${thread.access}). Start a new thread to change it.`)
  }
  if (thread.status === 'running') {
    throw refuse(`parlo: thread ${threadId} is still working. Wait for its reply first.`)
  }
  if (thread.status === 'stopped') {
    throw refuse(`parlo: thread ${threadId} was stopped. Start a new thread.`)
  }
  if (colleague.vendorSessionId === null) {
    throw refuse(`parlo: thread ${threadId} never got a session to continue. Start a new thread.`)
  }
  const sent = db.select({ n: count() }).from(messages).where(eq(messages.threadId, threadId)).get()!.n
  if (sent + 2 > LIMITS.maxThreadMessages) {
    throw refuse(`parlo: thread ${threadId} reached ${LIMITS.maxThreadMessages} messages. Decide yourself or ask the person.`)
  }
  db.update(threads)
    .set({ status: 'running', failure: null, runnerPid: input.runnerPid, colleaguePid: null, deadlineAt: deadline(input.now) })
    .where(eq(threads.id, threadId)).run()
  db.insert(messages).values({ threadId, fromId: caller.id, toId: colleague.id, body: input.body, createdAt: input.now }).run()
  return { threadId, access: thread.access }
}

export function recordSession(db: Db, agentId: number, sessionId: string, cwd?: string): void {
  db.update(agents).set(cwd === undefined ? { vendorSessionId: sessionId } : { vendorSessionId: sessionId, cwd }).where(eq(agents.id, agentId)).run()
}

export function recordColleaguePid(db: Db, threadId: number, pid: number): void {
  db.update(threads).set({ colleaguePid: pid }).where(eq(threads.id, threadId)).run()
}

export function recordRunnerPid(db: Db, threadId: number, pid: number): void {
  db.update(threads).set({ runnerPid: pid }).where(eq(threads.id, threadId)).run()
}

/** Store how a turn ended. A thread that was stopped while it ran stays stopped. */
export function finishThread(db: Db, threadId: number, outcome: RunOutcome, now: Date): void {
  db.transaction(tx => {
    const thread = tx.select().from(threads).where(eq(threads.id, threadId)).get()!
    if (thread.status !== 'running') return
    const done = { runnerPid: null, colleaguePid: null }
    switch (outcome.kind) {
      case 'reply':
        tx.insert(messages).values({ threadId, fromId: thread.colleagueId, toId: thread.callerId, body: outcome.text, createdAt: now }).run()
        tx.update(threads).set({ ...done, status: 'idle', failure: null }).where(eq(threads.id, threadId)).run()
        return
      case 'failed':
        tx.update(threads).set({ ...done, status: 'failed', failure: outcome.reason }).where(eq(threads.id, threadId)).run()
        return
      case 'timeout':
        tx.update(threads).set({ ...done, status: 'failed', failure: 'no reply within 30 minutes; the colleague was stopped' }).where(eq(threads.id, threadId)).run()
        return
      case 'stopped':
        tx.update(threads).set({ ...done, status: 'stopped', failure: null }).where(eq(threads.id, threadId)).run()
    }
  }, { behavior: 'immediate' })
}

/** A running thread whose runner process is gone can never finish: fail it, and stop the colleague it left behind. */
export function reapDeadRunners(db: Db): void {
  for (const thread of db.select().from(threads).where(eq(threads.status, 'running')).all()) {
    if (thread.runnerPid === null || isAlive(thread.runnerPid)) continue
    if (thread.colleaguePid !== null) killGroup(thread.colleaguePid)
    db.update(threads)
      .set({ status: 'failed', failure: 'parlo stopped before the colleague answered', runnerPid: null, colleaguePid: null })
      .where(eq(threads.id, thread.id)).run()
  }
}

export function markStopped(db: Db, threadIds: number[]): void {
  if (threadIds.length === 0) return
  db.update(threads).set({ status: 'stopped', failure: null })
    .where(and(inArray(threads.id, threadIds), eq(threads.status, 'running'))).run()
}
