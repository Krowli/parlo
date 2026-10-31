import { eq } from 'drizzle-orm'

import { colleagueEnv } from './identity'
import { firstPrompt } from './preamble'
import { runColleague } from './run-colleague'
import { runnerFor } from './runners'
import type { Db } from './store/db'
import { runPlan } from './store/reads'
import { threads } from './store/schema'
import { killGroup } from './process'
import { finishThread, recordColleaguePid, recordSession } from './store/threads'

function statusOf(db: Db, threadId: number) {
  return db.select({ status: threads.status }).from(threads).where(eq(threads.id, threadId)).get()!.status
}

/**
 * Run turn `turn` of a thread (the ask `beginAsk` recorded) and store how it
 * ended. A runner runs only that turn, and only while the thread still waits
 * for it: a thread stopped before the runner got to it, or a stale turn, starts
 * nothing. Returns whether it ran.
 */
export async function driveThread(db: Db, threadId: number, turn: number, onProgress: (line: string) => void, signal?: AbortSignal): Promise<boolean> {
  const plan = runPlan(db, threadId)
  if (plan.status !== 'running' || plan.turn !== turn) {
    return false
  }
  const outcome = await runColleague(
    runnerFor(plan.vendor),
    {
      prompt: plan.resume === null ? firstPrompt(plan.body, plan.access, plan.callerVendor) : plan.body,
      access: plan.access,
      cwd: plan.cwd,
      resume: plan.resume,
    },
    {
      onProgress,
      onSession: (sessionId, cwd) => recordSession(db, plan.colleagueAgentId, sessionId, cwd),
      onPid: pid => {
        recordColleaguePid(db, threadId, pid)
        // Stopped between the check above and this spawn: `stop` found no pid to signal, so do it here.
        if (statusOf(db, threadId) !== 'running') killGroup(pid)
      },
    },
    { deadlineMs: plan.deadlineAt.getTime() - Date.now(), env: colleagueEnv(), signal },
  )
  finishThread(db, threadId, outcome, new Date())
  return true
}
