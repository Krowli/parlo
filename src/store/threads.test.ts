import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EXIT, ParloError } from '../errors'
import type { CallerKey } from '../identity'
import { isAlive } from '../process'
import type { Db } from './db'
import { openStore, type OpenStore } from './open'
import { runningSubtree } from './reads'
import { agents, messages, threads } from './schema'
import { type AskInput, beginAsk, finishThread, markStopped, reapDeadRunners, recordSession } from './threads'

const ROOT: CallerKey = { vendor: 'claude', vendorSessionId: 'root-session' }
const NOW = new Date('2026-10-31T12:00:00Z')

let store: OpenStore
let db: Db
beforeEach(() => {
  store = openStore(mkdtempSync(join(tmpdir(), 'parlo-home-')))
  db = store.db
})
afterEach(() => store.close())

const input = (over: Partial<AskInput> = {}): AskInput => ({
  caller: ROOT, cwd: '/work', vendor: 'codex', threadId: null, access: null, body: 'hello', runnerPid: process.pid, now: NOW, ...over,
})

function refusal(run: () => unknown): ParloError {
  try {
    run()
  }
  catch (error) {
    if (error instanceof ParloError) return error
    throw error
  }
  throw new Error('expected a ParloError')
}

/** The colleague of a thread, as the caller it becomes once its session id is known. */
function colleagueAsCaller(threadId: number, sessionId: string): CallerKey {
  const thread = db.select().from(threads).where(eq(threads.id, threadId)).get()!
  recordSession(db, thread.colleagueId, sessionId)
  return { vendor: 'codex', vendorSessionId: sessionId }
}

describe('beginAsk: a new thread', () => {
  it('records the root, the colleague, the thread and the ask', () => {
    const started = beginAsk(db, input())
    expect(started).toEqual({ threadId: 1, access: 'read' })
    const all = db.select().from(agents).all()
    expect(all.map(a => [a.vendor, a.depth, a.parentId, a.rootId])).toEqual([['claude', 0, null, null], ['codex', 1, 1, 1]])
    expect(db.select().from(threads).get()).toMatchObject({ callerId: 1, colleagueId: 2, status: 'running', access: 'read', runnerPid: process.pid })
    expect(db.select().from(messages).all().map(m => [m.fromId, m.toId, m.body])).toEqual([[1, 2, 'hello']])
  })

  it('refuses a fourth colleague while three are working', () => {
    beginAsk(db, input())
    beginAsk(db, input())
    beginAsk(db, input())
    const error = refusal(() => beginAsk(db, input()))
    expect(error.exitCode).toBe(EXIT.refused)
    expect(error.message).toBe('parlo: you already have 3 colleagues working (limit 3). Wait for one to answer (parlo threads) before asking another.')
  })

  it('allows a colleague of a colleague and refuses one level deeper', () => {
    const first = beginAsk(db, input())
    const colleague = colleagueAsCaller(first.threadId, 'cx-1')
    const second = beginAsk(db, input({ caller: colleague }))
    const grandColleague = colleagueAsCaller(second.threadId, 'cx-2')
    const error = refusal(() => beginAsk(db, input({ caller: grandColleague })))
    expect(error.exitCode).toBe(EXIT.refused)
    expect(error.message).toContain('depth limit 2')
  })

  it('refuses a message over 256 KiB', () => {
    const error = refusal(() => beginAsk(db, input({ body: 'x'.repeat(256 * 1024 + 1) })))
    expect(error.exitCode).toBe(EXIT.refused)
    expect(error.message).toBe('parlo: the message is 257 KiB; the limit is 256 KiB. Shorten it.')
  })
})

describe('beginAsk: a follow-up', () => {
  function answeredThread(): number {
    const { threadId } = beginAsk(db, input())
    colleagueAsCaller(threadId, 'cx-1')
    finishThread(db, threadId, { kind: 'reply', text: 'pong' }, NOW)
    return threadId
  }

  it('continues an answered thread', () => {
    const threadId = answeredThread()
    expect(beginAsk(db, input({ threadId, body: 'and then?' }))).toEqual({ threadId, access: 'read' })
    expect(db.select().from(threads).where(eq(threads.id, threadId)).get()!.status).toBe('running')
  })

  it('lets only the agent that started a thread continue it, so a colleague cannot ask its caller back', () => {
    const threadId = answeredThread()
    const error = refusal(() => beginAsk(db, input({ caller: { vendor: 'codex', vendorSessionId: 'cx-1' }, threadId })))
    expect(error.exitCode).toBe(EXIT.refused)
    expect(error.message).toBe(`parlo: thread ${threadId} belongs to another agent; only the agent that started it can continue it.`)
  })

  it('refuses while the thread is still working', () => {
    const { threadId } = beginAsk(db, input())
    expect(refusal(() => beginAsk(db, input({ threadId }))).message).toBe(`parlo: thread ${threadId} is still working. Wait for its reply first.`)
  })

  it('refuses a stopped thread, and one that never got a session', () => {
    const stopped = beginAsk(db, input()).threadId
    markStopped(db, [stopped])
    expect(refusal(() => beginAsk(db, input({ threadId: stopped }))).message).toBe(`parlo: thread ${stopped} was stopped. Start a new thread.`)
    const sessionless = beginAsk(db, input()).threadId
    finishThread(db, sessionless, { kind: 'failed', reason: 'codex: exited with code 1: boom' }, NOW)
    expect(refusal(() => beginAsk(db, input({ threadId: sessionless }))).message).toBe(`parlo: thread ${sessionless} never got a session to continue. Start a new thread.`)
  })

  it('refuses the wrong colleague or a change of access as usage errors', () => {
    const threadId = answeredThread()
    expect(refusal(() => beginAsk(db, input({ threadId, vendor: 'claude' }))).exitCode).toBe(EXIT.usage)
    expect(refusal(() => beginAsk(db, input({ threadId, access: 'write' }))).exitCode).toBe(EXIT.usage)
    expect(refusal(() => beginAsk(db, input({ threadId: 99 }))).message).toBe('parlo: there is no thread 99. List yours with: parlo threads')
  })

  it('stops a thread at 20 messages', () => {
    const threadId = answeredThread()
    for (let turn = 2; turn <= 10; turn++) {
      beginAsk(db, input({ threadId }))
      finishThread(db, threadId, { kind: 'reply', text: 'ok' }, NOW)
    }
    const error = refusal(() => beginAsk(db, input({ threadId })))
    expect(error.exitCode).toBe(EXIT.refused)
    expect(error.message).toBe(`parlo: thread ${threadId} reached 20 messages. Decide yourself or ask the person.`)
  })
})

describe('finishThread and reaping', () => {
  it('keeps a stopped thread stopped and drops a late reply', () => {
    const { threadId } = beginAsk(db, input())
    markStopped(db, [threadId])
    finishThread(db, threadId, { kind: 'reply', text: 'late' }, NOW)
    expect(db.select().from(threads).where(eq(threads.id, threadId)).get()!.status).toBe('stopped')
    expect(db.select().from(messages).all()).toHaveLength(1)
  })

  it('fails a running thread whose runner is gone', async () => {
    const dead = spawn(process.execPath, ['-e', ''])
    await new Promise(resolve => dead.on('exit', resolve))
    expect(isAlive(dead.pid!)).toBe(false)
    const { threadId } = beginAsk(db, input({ runnerPid: dead.pid! }))
    reapDeadRunners(db)
    expect(db.select().from(threads).where(eq(threads.id, threadId)).get()).toMatchObject({ status: 'failed', failure: 'parlo stopped before the colleague answered' })
  })
})

describe('runningSubtree', () => {
  it('includes the threads a colleague started', () => {
    const first = beginAsk(db, input())
    const colleague = colleagueAsCaller(first.threadId, 'cx-1')
    const second = beginAsk(db, input({ caller: colleague }))
    beginAsk(db, input()) // a sibling thread of the root: not under thread 1
    expect(runningSubtree(db, first.threadId).map(t => t.id)).toEqual([first.threadId, second.threadId])
  })

  it('stops the colleague a dead runner left behind', async () => {
    const orphan = spawn('sleep', ['30'], { detached: true })
    const dead = spawn(process.execPath, ['-e', ''])
    await new Promise(resolve => dead.on('exit', resolve))
    const { threadId } = beginAsk(db, input({ runnerPid: dead.pid! }))
    db.update(threads).set({ colleaguePid: orphan.pid! }).where(eq(threads.id, threadId)).run()
    reapDeadRunners(db)
    await new Promise(resolve => orphan.on('exit', resolve))
    expect(isAlive(orphan.pid!)).toBe(false)
  })
})

describe('access never widens down the tree', () => {
  it('a read-only colleague can only start read-only colleagues', () => {
    const first = beginAsk(db, input())
    const colleague = colleagueAsCaller(first.threadId, 'cx-1')
    for (const access of ['write', 'worktree'] as const) {
      const error = refusal(() => beginAsk(db, input({ caller: colleague, vendor: 'claude', access })))
      expect(error.exitCode).toBe(EXIT.refused)
      expect(error.message).toBe('parlo: you were asked read-only, so a colleague you start is read-only too. Ask without --write or --worktree.')
    }
    expect(beginAsk(db, input({ caller: colleague, vendor: 'claude' })).access).toBe('read')
  })

  it('a colleague that may write may start one that writes', () => {
    const first = beginAsk(db, input({ access: 'write' }))
    const colleague = colleagueAsCaller(first.threadId, 'cx-1')
    expect(beginAsk(db, input({ caller: colleague, vendor: 'claude', access: 'write' })).access).toBe('write')
  })
})
