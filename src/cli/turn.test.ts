import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { openStore } from '../store/open'
import { beginAsk, markStopped } from '../store/threads'
import { testEnv, testPath } from '../testing/env'
import { fakeCli } from '../testing/fake-cli'
import { runCli } from '../testing/run-cli'

const fixture = (name: string) => readFileSync(packagePath('src/testing/fixtures', name), 'utf8')

function setup() {
  const fake = fakeCli('codex', [{ stdout: fixture('codex-reply.jsonl') }])
  const home = mkdtempSync(join(tmpdir(), 'parlo-home-'))
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'parlo-work-')))
  const env = testEnv({ PATH: testPath(fake.binDir), PARLO_HOME: home, CLAUDE_CODE_SESSION_ID: 'root-session' })
  const ask = () => {
    const { db, close } = openStore(home)
    const started = beginAsk(db, { caller: { vendor: 'claude', vendorSessionId: 'root-session' }, cwd, vendor: 'codex', threadId: null, access: null, body: 'q', runnerPid: process.pid, now: new Date() })
    return { started, db, close }
  }
  return { fake, env, cwd, ask }
}

describe('a runner only runs the turn it was started for', () => {
  it('does not start the colleague for a thread stopped before the runner got to it', async () => {
    const { fake, env, cwd, ask } = setup()
    const { started, db, close } = ask()
    markStopped(db, [started.threadId])
    close()
    const result = await runCli(['__run', String(started.threadId), String(started.messageId)], env, cwd)
    expect(result.code).toBe(0)
    expect(fake.calls()).toHaveLength(0)
  })

  it('does not run a turn that is not the thread\'s current one', async () => {
    const { fake, env, cwd, ask } = setup()
    const { started, close } = ask()
    close()
    const result = await runCli(['__run', String(started.threadId), String(started.messageId + 1)], env, cwd)
    expect(result.code).toBe(0)
    expect(fake.calls()).toHaveLength(0)
  })
})
