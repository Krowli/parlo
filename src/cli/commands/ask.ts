import { driveThread } from '../../drive-thread'
import type { ExitCode } from '../../errors'
import { callerKey } from '../../identity'
import { abortOnSignals } from '../../process'
import type { Access, ColleagueVendor } from '../../runners/types'
import { openStore } from '../../store/open'
import { beginAsk } from '../../store/threads'
import { ACCESS_LABEL } from '../output'
import { reportThread } from '../report'

export interface AskFlags {
  thread: number | null
  access: Access | null
}

export async function ask(vendor: ColleagueVendor, message: string, flags: AskFlags): Promise<ExitCode> {
  const { db, close } = openStore()
  try {
    const started = beginAsk(db, {
      caller: callerKey(), cwd: process.cwd(), vendor, threadId: flags.thread, access: flags.access, body: message, runnerPid: process.pid, now: new Date(),
    })
    process.stderr.write(`parlo: thread ${started.threadId} — asking ${vendor} (${ACCESS_LABEL[started.access]})\n`)
    await driveThread(db, started.threadId, line => process.stderr.write(`${line}\n`), abortOnSignals())
    return reportThread(db, started.threadId)
  }
  finally {
    close()
  }
}
