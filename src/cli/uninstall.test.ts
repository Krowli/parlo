import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { isAlive } from '../process'
import { testEnv, testPath } from '../testing/env'
import { fakeCli } from '../testing/fake-cli'
import { runCli } from '../testing/run-cli'

function user(binDir?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'parlo-user-'))
  const env = testEnv({ HOME: dir, PARLO_HOME: join(dir, '.parlo'), PATH: testPath(binDir), CLAUDE_CODE_SESSION_ID: 'root-session' })
  delete env.CODEX_HOME // the developer's own Codex home must not be touched
  return { dir, env }
}

describe('parlo uninstall', () => {
  it('removes what connect installed for every agent, keeps the data, and names the last step', async () => {
    const { dir, env } = user()
    await runCli(['connect', 'claude', '--yes'], env)
    await runCli(['connect', 'codex', '--yes'], env)
    await runCli(['threads'], env) // creates ~/.parlo/parlo.db
    const result = await runCli(['uninstall', '--yes'], env)
    expect(result.code).toBe(0)
    expect(existsSync(join(dir, '.claude/skills/parlo'))).toBe(false)
    expect(existsSync(join(dir, '.agents/skills/parlo'))).toBe(false)
    expect(existsSync(join(dir, '.codex/rules/parlo.rules'))).toBe(false)
    expect(existsSync(join(dir, '.parlo/parlo.db'))).toBe(true)
    expect(result.stdout).toContain('Last step: npm uninstall -g parlo-cli')
  })

  it('keeps ~/.parlo on --purge without a terminal to confirm in', async () => {
    const { dir, env } = user()
    await runCli(['threads'], env)
    const result = await runCli(['uninstall', '--yes', '--purge'], env)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('kept ~/.parlo: deleting it needs a yes in a terminal')
    expect(existsSync(join(dir, '.parlo/parlo.db'))).toBe(true)
  })

  it('stops a colleague that is still working', async () => {
    const fake = fakeCli('codex', [{ stdout: readFileSync(packagePath('src/testing/fixtures/codex-reply.jsonl'), 'utf8'), delayMs: 60_000 }])
    const { env } = user(fake.binDir)
    const ask = spawn(process.execPath, ['--import', 'tsx', packagePath('src/cli/index.ts'), 'ask', 'codex', 'q'], { env, cwd: packagePath(), stdio: 'ignore' })
    const exited = new Promise<number>(resolve => ask.on('close', code => resolve(code ?? -1)))
    for (let i = 0; i < 100 && fake.calls().length === 0; i++) await new Promise(resolve => setTimeout(resolve, 100))
    const result = await runCli(['uninstall', '--yes'], env)
    expect(result.stdout).toContain('stopped #1')
    expect(await exited).toBe(5)
    expect(isAlive(fake.calls()[0].pid)).toBe(false)
  })

  it('says when there is nothing to remove', async () => {
    const { env } = user()
    expect((await runCli(['uninstall', '--yes'], env)).stdout).toBe('parlo: nothing to remove. Last step: npm uninstall -g parlo-cli\n')
  })
})
