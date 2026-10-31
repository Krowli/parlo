import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from './package-path'
import { isAlive } from './process'
import { runColleague } from './run-colleague'
import { codexRunner } from './runners/codex'
import { testEnv, testPath } from './testing/env'
import { fakeCli } from './testing/fake-cli'

const fixture = (name: string) => readFileSync(packagePath('src/testing/fixtures', name), 'utf8')
const workdir = () => realpathSync(mkdtempSync(join(tmpdir(), 'parlo-work-')))

async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    if (!isAlive(pid)) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

describe('runColleague', () => {
  it('passes the prompt intact on stdin and returns the reply', async () => {
    const fake = fakeCli('codex', [{ stdout: fixture('codex-reply.jsonl') }])
    const cwd = workdir()
    const prompt = '-x "quoted"\nsecond line — ünïcode'
    const lines: string[] = []
    const sessions: string[] = []
    const pids: number[] = []
    const outcome = await runColleague(codexRunner, { prompt, access: 'read', cwd, resume: null }, {
      onProgress: line => lines.push(line),
      onSession: id => sessions.push(id),
      onPid: pid => pids.push(pid),
    }, { deadlineMs: 10_000, env: testEnv({ PATH: testPath(fake.binDir) }) })

    expect(outcome).toEqual({ kind: 'reply', text: 'pong' })
    const [call] = fake.calls()
    expect(call.stdin).toBe(prompt)
    expect(call.cwd).toBe(cwd)
    expect(call.argv).toEqual(['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd, '-'])
    expect(sessions).toEqual(['01a192ad-cd04-7480-9d95-797c1fc3c4ec'])
    expect(pids).toHaveLength(1)
    expect(lines).toContain('codex: $ ls -la')
  })

  it('says when the CLI is not installed', async () => {
    const outcome = await runColleague(codexRunner, { prompt: 'x', access: 'read', cwd: workdir(), resume: null }, { onProgress: () => {} }, { deadlineMs: 10_000, env: testEnv({ PATH: testPath() }) })
    expect(outcome).toEqual({ kind: 'failed', reason: 'codex is not installed or not on PATH' })
  })

  it('treats a run with no reply as a failure, not a crash', async () => {
    const fake = fakeCli('codex', [{ stdout: fixture('codex-noise.jsonl') }])
    const outcome = await runColleague(codexRunner, { prompt: 'x', access: 'read', cwd: workdir(), resume: null }, { onProgress: () => {} }, { deadlineMs: 10_000, env: testEnv({ PATH: testPath(fake.binDir) }) })
    expect(outcome).toEqual({ kind: 'failed', reason: 'codex: ended without a reply' })
  })

  it('strips colour codes from the stderr it reports', async () => {
    const fake = fakeCli('codex', [{ stdout: '', stderr: '\u001b[31mERROR\u001b[0m not logged in\n', exitCode: 1 }])
    const outcome = await runColleague(codexRunner, { prompt: 'x', access: 'read', cwd: workdir(), resume: null }, { onProgress: () => {} }, { deadlineMs: 10_000, env: testEnv({ PATH: testPath(fake.binDir) }) })
    expect(outcome).toEqual({ kind: 'failed', reason: 'codex: exited with code 1: ERROR not logged in' })
  })

  it('stops a colleague that passes its deadline', async () => {
    const fake = fakeCli('codex', [{ stdout: fixture('codex-reply.jsonl'), delayMs: 60_000 }])
    const outcome = await runColleague(codexRunner, { prompt: 'x', access: 'read', cwd: workdir(), resume: null }, { onProgress: () => {} }, { deadlineMs: 500, env: testEnv({ PATH: testPath(fake.binDir) }) })
    expect(outcome).toEqual({ kind: 'timeout' })
    expect(await gone(fake.calls()[0].pid)).toBe(true)
  })

  it('stops the colleague when parlo is told to stop', async () => {
    const fake = fakeCli('codex', [{ stdout: fixture('codex-reply.jsonl'), delayMs: 60_000 }])
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 500)
    const outcome = await runColleague(codexRunner, { prompt: 'x', access: 'read', cwd: workdir(), resume: null }, { onProgress: () => {} }, { deadlineMs: 60_000, env: testEnv({ PATH: testPath(fake.binDir) }), signal: controller.signal })
    expect(outcome).toEqual({ kind: 'stopped' })
    expect(await gone(fake.calls()[0].pid)).toBe(true)
  })
})
