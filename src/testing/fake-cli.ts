import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface FakeRun {
  /** What the fake prints on stdout: usually a recorded event stream. */
  stdout: string
  stderr?: string
  exitCode?: number
  /** How long it waits after stdin closes before printing; long values make a colleague that hangs. */
  delayMs?: number
}

export interface FakeCall {
  argv: string[]
  stdin: string
  cwd: string
  pid: number
}

/**
 * A directory holding a fake `codex` or `claude`. The n-th invocation plays
 * the n-th run (the last one repeats) and records its argv, stdin, cwd and pid.
 */
export function fakeCli(name: 'codex' | 'claude', runs: FakeRun[]): { binDir: string; calls: () => FakeCall[] } {
  const dir = mkdtempSync(join(tmpdir(), 'parlo-fake-'))
  writeFileSync(join(dir, 'runs.json'), JSON.stringify(runs))
  const script = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const dir = ${JSON.stringify(dir)}
const callsFile = path.join(dir, 'calls.jsonl')
const index = fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').split('\\n').filter(Boolean).length : 0
const runs = JSON.parse(fs.readFileSync(path.join(dir, 'runs.json'), 'utf8'))
const run = runs[Math.min(index, runs.length - 1)]
let stdin = ''
process.stdin.on('data', chunk => { stdin += chunk })
process.stdin.on('end', () => {
  fs.appendFileSync(callsFile, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd(), pid: process.pid }) + '\\n')
  setTimeout(() => {
    if (run.stderr) process.stderr.write(run.stderr)
    process.stdout.write(run.stdout, () => process.exit(run.exitCode ?? 0))
  }, run.delayMs ?? 0)
})
`
  const file = join(dir, name)
  writeFileSync(file, script)
  chmodSync(file, 0o755)
  const calls = (): FakeCall[] => {
    const callsFile = join(dir, 'calls.jsonl')
    return existsSync(callsFile)
      ? readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as FakeCall)
      : []
  }
  return { binDir: dir, calls }
}
