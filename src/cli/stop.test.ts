import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { isAlive } from '../process'
import { openStore } from '../store/open'
import { threads } from '../store/schema'
import { beginAsk, recordColleaguePid, recordSession } from '../store/threads'
import { testEnv, testPath } from '../testing/env'
import { fakeCli } from '../testing/fake-cli'
import { runCli } from '../testing/run-cli'

const fixture = (name: string) => readFileSync(packagePath('src/testing/fixtures', name), 'utf8')

function hangingAsk() {
  const fake = fakeCli('codex', [{ stdout: fixture('codex-reply.jsonl'), delayMs: 60_000 }])
  const home = mkdtempSync(join(tmpdir(), 'parlo-home-'))
  const cwd = packagePath()
  const env = testEnv({ PATH: testPath(fake.binDir), PARLO_HOME: home, CLAUDE_CODE_SESSION_ID: 'root-session' })
  // Run parlo directly under node (not through the tsx binary, which is a second process), so SIGTERM reaches parlo itself.
  // `--import tsx` resolves from cwd, hence the package root as cwd; this test doesn't care where the colleague works.
  const child = spawn(process.execPath, ['--import', 'tsx', packagePath('src/cli/index.ts'), 'ask', 'codex', 'q'], { env, cwd: packagePath(), stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  const exited = new Promise<number>(resolve => child.on('close', code => resolve(code ?? -1)))
  const colleagueStarted = async () => {
    for (let i = 0; i < 100 && fake.calls().length === 0; i++) await new Promise(resolve => setTimeout(resolve, 100))
    return fake.calls()[0].pid
  }
  return { child, env, cwd, home, exited, colleagueStarted, stderr: () => stderr }
}

async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    if (!isAlive(pid)) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

describe('stopping a colleague', () => {
  it('parlo stop --thread ends it, and the ask reports it was stopped', async () => {
    const run = hangingAsk()
    const pid = await run.colleagueStarted()
    const stop = await runCli(['stop', '--thread', '1'], run.env, run.cwd)
    expect(stop.stdout).toBe('parlo: stopped #1.\n')
    expect(await run.exited).toBe(5)
    expect(run.stderr()).toContain('parlo: thread 1 was stopped.')
    expect(await gone(pid)).toBe(true)
  })

  it('SIGTERM to parlo ask (a task stopped in /tasks) ends the colleague too', async () => {
    const run = hangingAsk()
    const pid = await run.colleagueStarted()
    run.child.kill('SIGTERM')
    expect(await run.exited).toBe(5)
    expect(await gone(pid)).toBe(true)
    expect((await runCli(['threads'], run.env, run.cwd)).stdout).toContain('stopped')
  })

  it('says when nothing was running', async () => {
    const home = mkdtempSync(join(tmpdir(), 'parlo-home-'))
    expect((await runCli(['stop', '--all'], testEnv({ PARLO_HOME: home }))).stdout).toBe('parlo: nothing was running.\n')
  })
})

describe('stopping reaches colleagues of colleagues', () => {
  it('stopping thread 1 also stops the thread its colleague started (a detached one, outside its process group)', async () => {
    const run = hangingAsk()
    await run.colleagueStarted() // thread 1's Codex is running
    // Thread 1's colleague asks a colleague of its own: thread 2, whose colleague runs in a group of its own.
    // The fake prints its stream (and so its session) only at the end, so name the session here.
    const grandchild = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
    const { db, close } = openStore(run.home)
    const first = db.select().from(threads).get()!
    recordSession(db, first.colleagueId, 'codex-colleague')
    const second = beginAsk(db, { caller: { vendor: 'codex', vendorSessionId: 'codex-colleague' }, cwd: run.cwd, vendor: 'claude', threadId: null, access: null, body: 'nested', runnerPid: process.pid, now: new Date() })
    recordColleaguePid(db, second.threadId, grandchild.pid!)
    close()
    run.child.kill('SIGTERM')
    expect(await run.exited).toBe(5)
    expect(await gone(grandchild.pid!)).toBe(true)
    expect((await runCli(['show', String(second.threadId)], run.env, run.cwd)).stdout).toContain('— stopped')
  })
})
