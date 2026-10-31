import { spawn } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'

import { driveThread } from '../../drive-thread'
import { EXIT, type ExitCode } from '../../errors'
import { callerKey } from '../../identity'
import { abortOnSignals } from '../../process'
import type { Access, ColleagueVendor } from '../../runners/types'
import { parloHome } from '../../store/home'
import { openStore } from '../../store/open'
import { beginAsk, recordRunnerPid } from '../../store/threads'
import { ACCESS_LABEL } from '../output'
import { reportThread } from '../report'

export interface AskFlags {
  thread: number | null
  access: Access | null
  detach: boolean
}

export async function ask(vendor: ColleagueVendor, message: string, flags: AskFlags): Promise<ExitCode> {
  const { db, close } = openStore()
  try {
    const started = beginAsk(db, {
      caller: callerKey(), cwd: process.cwd(), vendor, threadId: flags.thread, access: flags.access, body: message, runnerPid: process.pid, now: new Date(),
    })
    if (flags.detach) {
      const logs = join(parloHome(), 'logs')
      mkdirSync(logs, { recursive: true })
      const log = openSync(join(logs, `${started.threadId}.log`), 'a')
      // The same parlo, run again: `process.argv[1]` is bin/parlo.mjs once installed, or the tsx entry in tests.
      const runner = spawn(process.execPath, [...process.execArgv, process.argv[1], '__run', String(started.threadId)], {
        detached: true, stdio: ['ignore', log, log], env: process.env,
      })
      // Record the runner before this process exits, so reaping never sees a dead pid in between.
      recordRunnerPid(db, started.threadId, runner.pid!)
      runner.unref()
      process.stdout.write(`parlo: thread ${started.threadId} started with ${vendor}. Get the reply with: parlo wait ${started.threadId}\n`)
      return EXIT.ok
    }
    process.stderr.write(`parlo: thread ${started.threadId} — asking ${vendor} (${ACCESS_LABEL[started.access]})\n`)
    await driveThread(db, started.threadId, line => process.stderr.write(`${line}\n`), abortOnSignals())
    return reportThread(db, started.threadId)
  }
  finally {
    close()
  }
}
