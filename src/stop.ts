import { eq } from 'drizzle-orm'

import { killGroup } from './process'
import type { Db } from './store/db'
import { runningSubtree } from './store/reads'
import { threads } from './store/schema'
import { markStopped, reapDeadRunners } from './store/threads'

/**
 * Stop running threads. Mark first, then signal: the runner that sees its
 * colleague die finds the thread already stopped and leaves it so
 * (finishThread). Returns the ids it stopped.
 */
export function stopTargets(db: Db, target: { thread: number } | { all: true }): number[] {
  reapDeadRunners(db)
  const targets = 'all' in target
    ? db.select().from(threads).where(eq(threads.status, 'running')).all()
    : runningSubtree(db, target.thread)
  markStopped(db, targets.map(thread => thread.id))
  for (const thread of targets) {
    if (thread.colleaguePid !== null) killGroup(thread.colleaguePid)
  }
  return targets.map(thread => thread.id)
}

/**
 * Stop what a thread's colleague started, but not the thread itself: when a
 * turn is stopped or runs out of time, the colleague's own colleagues must not
 * go on. A detached one runs outside the colleague's process group, so killing
 * that group does not reach it.
 */
export function stopUnder(db: Db, threadId: number): void {
  const under = runningSubtree(db, threadId).filter(thread => thread.id !== threadId)
  markStopped(db, under.map(thread => thread.id))
  for (const thread of under) {
    if (thread.colleaguePid !== null) killGroup(thread.colleaguePid)
  }
}
