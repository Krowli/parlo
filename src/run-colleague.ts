import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import { killGroup } from './process'
import type { Runner, RunOutcome, RunRequest } from './runners/types'

export interface RunHooks {
  onProgress(line: string): void
  /** The colleague's vendor session id, and for Claude its working directory, as soon as the stream names them. */
  onSession?(sessionId: string, cwd?: string): void
  onPid?(pid: number): void
}

export interface RunOptions {
  deadlineMs: number
  env: NodeJS.ProcessEnv
  signal?: AbortSignal
}

const STDERR_KEPT = 4000
const ANSI = /\u001b\[[0-9;]*m/g

/**
 * Run one colleague turn. The colleague's CLI gets its own process group
 * (`detached`), so a deadline or a stop can end it and every command it started.
 */
export function runColleague(runner: Runner, request: RunRequest, hooks: RunHooks, options: RunOptions): Promise<RunOutcome> {
  return new Promise(resolve => {
    const child = spawn(runner.command, runner.args(request), {
      cwd: request.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })
    const parser = runner.createParser()
    let stderrTail = ''
    let settled = false
    const settle = (outcome: RunOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(outcome)
    }
    const stopChild = () => {
      if (child.pid !== undefined) killGroup(child.pid)
    }
    const timer = setTimeout(() => {
      stopChild()
      settle({ kind: 'timeout' })
    }, options.deadlineMs)
    options.signal?.addEventListener('abort', () => {
      stopChild()
      settle({ kind: 'stopped' })
    }, { once: true })

    child.on('error', error => {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
      settle({ kind: 'failed', reason: missing ? `${runner.command} is not installed or not on PATH` : `${runner.command}: ${error.message}` })
    })
    if (child.pid !== undefined) hooks.onPid?.(child.pid)

    // A colleague that exits before reading its prompt makes this write fail
    // (EPIPE). That's the same failure the 'error' or 'close' event reports.
    child.stdin.on('error', () => {})
    child.stdin.end(request.prompt)

    createInterface({ input: child.stdout }).on('line', line => {
      for (const event of parser.push(line)) {
        if (event.kind === 'session') hooks.onSession?.(event.sessionId, event.cwd)
        else hooks.onProgress(event.line)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_KEPT)
    })
    child.on('close', code => settle(parser.end(code ?? 1, stderrTail.replace(ANSI, ''))))
  })
}
