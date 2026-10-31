export type ColleagueVendor = 'claude' | 'codex'

/** What a colleague may do: `read` changes nothing, `write` edits here, `worktree` edits in its own git worktree. */
export type Access = 'read' | 'write' | 'worktree'

export interface RunRequest {
  prompt: string
  access: Access
  /** Where the colleague works. */
  cwd: string
  /** The vendor session to continue, or null to start a new one. */
  resume: string | null
}

export type RunEvent =
  | { kind: 'session'; sessionId: string; cwd?: string }
  | { kind: 'progress'; line: string }

export type RunOutcome =
  | { kind: 'reply'; text: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'timeout' }
  | { kind: 'stopped' }

export interface StreamParser {
  /** One stdout line of the CLI in, the events it stands for out. */
  push(line: string): RunEvent[]
  /** The CLI exited: what its run came to. */
  end(exitCode: number, stderrTail: string): RunOutcome
}

/** Everything parlo knows about one vendor's CLI. */
export interface Runner {
  vendor: ColleagueVendor
  command: string
  args(request: RunRequest): string[]
  createParser(): StreamParser
}
