export type Vendor = 'claude' | 'codex' | 'shell'

export interface CallerKey {
  vendor: Vendor
  vendorSessionId: string
}

/**
 * The variables that say which agent session a process belongs to (spike
 * result 5). Claude Code gives its commands CLAUDE_CODE_SESSION_ID, Codex gives
 * CODEX_THREAD_ID. A colleague must not inherit its caller's, or its own
 * `parlo ask` would be counted as the caller's.
 */
export const IDENTITY_VARIABLES = [
  'CODEX_THREAD_ID',
  'CODEX_SESSION_ID',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_PID',
] as const

/** Who is running `parlo`. Codex first: a Codex started inside a Claude Code shell still sees Claude's variable. */
export function callerKey(env: NodeJS.ProcessEnv = process.env, ppid: number = process.ppid): CallerKey {
  if (env.CODEX_THREAD_ID) {
    return { vendor: 'codex', vendorSessionId: env.CODEX_THREAD_ID }
  }
  if (env.CLAUDE_CODE_SESSION_ID) {
    return { vendor: 'claude', vendorSessionId: env.CLAUDE_CODE_SESSION_ID }
  }
  return { vendor: 'shell', vendorSessionId: `ppid:${ppid}` }
}

/** The environment a colleague is started with: the caller's, minus the caller's identity. */
export function colleagueEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env }
  for (const name of IDENTITY_VARIABLES) {
    delete out[name]
  }
  return out
}
