import { dirname } from 'node:path'

import { IDENTITY_VARIABLES } from '../identity'

/** A PATH with the fake CLIs first, then node, then the system — never the developer's real `codex` or `claude`. */
export function testPath(binDir?: string): string {
  return [...(binDir ? [binDir] : []), dirname(process.execPath), '/usr/bin', '/bin'].join(':')
}

/** The test process's env minus any agent identity it runs under (tests run inside Claude Code and Codex). */
export function testEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of IDENTITY_VARIABLES) {
    delete env[name]
  }
  return { ...env, PATH: testPath(), ...extra }
}
