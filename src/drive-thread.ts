import { colleagueEnv } from './identity'
import { firstPrompt } from './preamble'
import { runColleague } from './run-colleague'
import { runnerFor } from './runners'
import type { Db } from './store/db'
import { runPlan } from './store/reads'
import { finishThread, recordColleaguePid, recordSession } from './store/threads'

/** Run the turn `beginAsk` just recorded on a thread, and store how it ended. */
export async function driveThread(db: Db, threadId: number, onProgress: (line: string) => void, signal?: AbortSignal): Promise<void> {
  const plan = runPlan(db, threadId)
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
      onPid: pid => recordColleaguePid(db, threadId, pid),
    },
    { deadlineMs: plan.deadlineAt.getTime() - Date.now(), env: colleagueEnv(), signal },
  )
  finishThread(db, threadId, outcome, new Date())
}
