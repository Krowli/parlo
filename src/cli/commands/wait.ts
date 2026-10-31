import type { ExitCode } from '../../errors'
import { openStore } from '../../store/open'
import { getThread } from '../../store/reads'
import { reportThread } from '../report'

/**
 * Wait up to `timeoutSeconds` for a thread's reply. A Codex caller's shell tool
 * waits at most 30 s per poll (spike result 4), so the default stays under it.
 */
export async function waitCommand(threadId: number, timeoutSeconds: number): Promise<ExitCode> {
  const { db, close } = openStore()
  try {
    const until = Date.now() + timeoutSeconds * 1000
    while (getThread(db, threadId).thread.status === 'running' && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    return reportThread(db, threadId)
  }
  finally {
    close()
  }
}
