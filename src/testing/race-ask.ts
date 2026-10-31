// node race-ask.ts <home> <barrier-file> <open|ask>
// Waits for the barrier file, then opens the store (and, for `ask`, asks once as `root-session`).
import { existsSync } from 'node:fs'

import { ParloError } from '../errors'
import { openStore } from '../store/open'
import { beginAsk } from '../store/threads'

const [home, barrier, mode] = process.argv.slice(2)
while (!existsSync(barrier)) {
  await new Promise(resolve => setTimeout(resolve, 2))
}
const { db, close } = openStore(home)
try {
  if (mode === 'ask') {
    beginAsk(db, {
      caller: { vendor: 'claude', vendorSessionId: 'root-session' }, cwd: '/work', vendor: 'codex', threadId: null,
      access: null, body: 'race', runnerPid: Number(process.env.RACE_RUNNER_PID), now: new Date(),
    })
  }
  console.log('ok')
}
catch (error) {
  console.log(error instanceof ParloError ? `refused:${error.exitCode}` : `error:${String(error)}`)
}
finally {
  close()
}
