import { eq } from 'drizzle-orm'

import { EXIT, type ExitCode } from '../../errors'
import { killGroup } from '../../process'
import type { Db } from '../../store/db'
import { openStore } from '../../store/open'
import { runningSubtree } from '../../store/reads'
import { threads } from '../../store/schema'
import { markStopped, reapDeadRunners } from '../../store/threads'

/**
 * Mark first, then signal: the runner that sees its colleague die finds the
 * thread already stopped and leaves it so (finishThread). Returns the ids it stopped.
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

export function stopCommand(target: { thread: number } | { all: true }): ExitCode {
  const { db, close } = openStore()
  try {
    const stopped = stopTargets(db, target)
    process.stdout.write(stopped.length === 0 ? 'parlo: nothing was running.\n' : `parlo: stopped ${stopped.map(id => `#${id}`).join(', ')}.\n`)
    return EXIT.ok
  }
  finally {
    close()
  }
}
