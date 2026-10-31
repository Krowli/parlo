import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { testEnv } from '../testing/env'
import { openStore } from './open'
import { beginAsk } from './threads'

function racer(home: string, barrier: string, mode: 'open' | 'ask'): Promise<string> {
  return new Promise(resolve => {
    const child = spawn(packagePath('node_modules/.bin/tsx'), [packagePath('src/testing/race-ask.ts'), home, barrier, mode], {
      env: testEnv({ RACE_RUNNER_PID: String(process.pid) }),
    })
    let out = ''
    child.stdout.on('data', chunk => { out += chunk })
    child.on('close', () => resolve(out.trim()))
  })
}

async function race(home: string, mode: 'open' | 'ask'): Promise<string[]> {
  const barrier = join(home, 'go')
  const runs = [racer(home, barrier, mode), racer(home, barrier, mode)]
  await new Promise(resolve => setTimeout(resolve, 1500)) // both processes are up and spinning
  writeFileSync(barrier, '')
  return (await Promise.all(runs)).sort()
}

describe('two processes at once', () => {
  it('both open an empty home', async () => {
    expect(await race(mkdtempSync(join(tmpdir(), 'parlo-race-')), 'open')).toEqual(['ok', 'ok'])
  })

  it('let exactly one through when one colleague slot is left', async () => {
    const home = mkdtempSync(join(tmpdir(), 'parlo-race-'))
    const { db, close } = openStore(home)
    for (let i = 0; i < 2; i++) {
      beginAsk(db, { caller: { vendor: 'claude', vendorSessionId: 'root-session' }, cwd: '/work', vendor: 'codex', threadId: null, access: null, body: 'x', runnerPid: process.pid, now: new Date() })
    }
    close()
    expect(await race(home, 'ask')).toEqual(['ok', 'refused:3'])
  })
})
