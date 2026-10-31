import { spawn } from 'node:child_process'

import { packagePath } from '../package-path'

export interface CliResult { code: number; stdout: string; stderr: string }

/** Run `parlo` from source, from any directory: tsx and the entry are addressed by absolute path. */
export function runCli(args: string[], env: NodeJS.ProcessEnv, cwd: string = process.cwd(), input?: string): Promise<CliResult> {
  return new Promise(resolve => {
    const child = spawn(packagePath('node_modules/.bin/tsx'), [packagePath('src/cli/index.ts'), ...args], { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    // Never a terminal: like an agent's shell. Empty unless the test gives input.
    child.stdin.end(input ?? '')
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }))
  })
}
