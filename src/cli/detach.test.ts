import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { testEnv, testPath } from '../testing/env'
import { fakeCli } from '../testing/fake-cli'
import { runCli } from '../testing/run-cli'

const fixture = (name: string) => readFileSync(packagePath('src/testing/fixtures', name), 'utf8')

describe('ask --detach and wait', () => {
  it('returns at once, then wait reports still working, then the reply', async () => {
    const fake = fakeCli('claude', [{ stdout: fixture('claude-reply.jsonl'), delayMs: 3000 }])
    const home = mkdtempSync(join(tmpdir(), 'parlo-home-'))
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'parlo-work-')))
    const env = testEnv({ PATH: testPath(fake.binDir), PARLO_HOME: home, CODEX_THREAD_ID: 'codex-root' })

    const started = Date.now()
    const detached = await runCli(['ask', '--detach', 'claude', 'q'], env, cwd)
    expect(detached.code).toBe(0)
    expect(detached.stdout).toBe('parlo: thread 1 started with claude. Get the reply with: parlo wait 1\n')
    expect(Date.now() - started).toBeLessThan(2500)

    const early = await runCli(['wait', '1', '--timeout', '1'], env, cwd)
    expect(early.code).toBe(4)
    expect(early.stderr).toContain('parlo: thread 1 is still working')

    const done = await runCli(['wait', '1', '--timeout', '20'], env, cwd)
    expect(done.code).toBe(0)
    expect(done.stdout).toContain('----- reply -----\npong\n----- end -----')
    expect(readFileSync(join(home, 'logs', '1.log'), 'utf8')).toContain('claude: Bash ls -la')
  })
})
