import type { ThreadEvent, ThreadItem } from '@openai/codex-sdk'

import { lastLine, oneLine, parseJsonLine } from './text'
import type { Runner, RunEvent, StreamParser } from './types'

/** `/bin/zsh -lc 'ls -la'` → `ls -la`: Codex wraps each command in a login shell. */
function unwrapShell(command: string): string {
  const match = /^\/bin\/(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/.exec(command)
  return match ? match[2] : command
}

/** A started item worth a progress line. Messages and file changes are reported when they complete. */
function describeStarted(item: ThreadItem): string | null {
  switch (item.type) {
    case 'command_execution': return `$ ${unwrapShell(item.command)}`
    case 'mcp_tool_call': return `${item.server}.${item.tool}`
    case 'web_search': return `searched: ${item.query}`
    default: return null
  }
}

function progress(text: string): RunEvent {
  return { kind: 'progress', line: `codex: ${oneLine(text)}` }
}

function createCodexParser(): StreamParser {
  let reply: string | null = null
  let error: string | null = null
  return {
    push(line) {
      const event = parseJsonLine<ThreadEvent>(line)
      if (event === null) {
        return []
      }
      switch (event.type) {
        case 'thread.started':
          return [{ kind: 'session', sessionId: event.thread_id }]
        case 'item.started': {
          const said = describeStarted(event.item)
          return said === null ? [] : [progress(said)]
        }
        case 'item.completed':
          if (event.item.type === 'agent_message') {
            reply = event.item.text
            return [progress(event.item.text)]
          }
          if (event.item.type === 'file_change') {
            return [progress(`edited ${event.item.changes.map(change => change.path).join(', ')}`)]
          }
          return []
        case 'turn.failed':
          error = event.error.message
          return []
        case 'error':
          error = event.message
          return []
        default:
          return []
      }
    },
    end(exitCode, stderrTail) {
      if (exitCode === 0 && reply !== null && error === null) {
        return { kind: 'reply', text: reply }
      }
      const reason = error ?? (exitCode === 0 ? 'ended without a reply' : `exited with code ${exitCode}: ${lastLine(stderrTail)}`)
      return { kind: 'failed', reason: `codex: ${reason}` }
    },
  }
}

/** Codex, run headless (`codex exec --json`). The flags were checked against codex-cli 0.166.0. */
export const codexRunner: Runner = {
  vendor: 'codex',
  command: 'codex',
  ownWorktree: false,
  args(request) {
    // The sandbox and the directory go in on every turn, before `resume`, as the
    // Codex SDK does; the user's config must not decide them on a follow-up.
    // The prompt goes in on stdin (`-`): a prompt in argv could be read as a flag.
    const common = ['exec', '--json', '--skip-git-repo-check', '-s', request.access === 'read' ? 'read-only' : 'workspace-write', '-C', request.cwd]
    return request.resume === null ? [...common, '-'] : [...common, 'resume', request.resume, '-']
  },
  createParser: createCodexParser,
}
