import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'

import { lastLine, oneLine, parseJsonLine } from './text'
import type { Access, Runner, RunEvent, StreamParser } from './types'

/** Spike result 6: with no mode, `-p` follows the person's own settings and wrote files; `plan` did not. */
const PERMISSION_MODE: Record<Access, string> = { read: 'plan', write: 'acceptEdits', worktree: 'acceptEdits' }

function describeTool(name: string, input: Record<string, unknown>): string {
  const detail = [input.command, input.file_path, input.pattern, input.url, input.query].find(value => typeof value === 'string')
  return detail === undefined ? name : `${name} ${detail as string}`
}

function createClaudeParser(): StreamParser {
  let result: SDKResultMessage | null = null
  return {
    push(line) {
      const message = parseJsonLine<SDKMessage>(line)
      if (message === null) return []
      if (message.type === 'system' && message.subtype === 'init') {
        return [{ kind: 'session', sessionId: message.session_id, cwd: message.cwd }]
      }
      if (message.type === 'assistant') {
        return message.message.content.flatMap((block): RunEvent[] => {
          if (block.type === 'text') return [{ kind: 'progress', line: `claude: ${oneLine(block.text)}` }]
          if (block.type === 'tool_use') return [{ kind: 'progress', line: `claude: ${oneLine(describeTool(block.name, block.input as Record<string, unknown>))}` }]
          return []
        })
      }
      if (message.type === 'result') {
        result = message
      }
      return []
    },
    end(exitCode, stderrTail) {
      if (result?.subtype === 'success') {
        // A "success" with is_error set carries the error in `result`: a logged-out CLI, an API error.
        return result.is_error ? { kind: 'failed', reason: `claude: ${oneLine(result.result)}` } : { kind: 'reply', text: result.result }
      }
      if (result !== null) {
        const why = result.errors?.[0]
        return { kind: 'failed', reason: why === undefined ? `claude: ${result.subtype}` : `claude: ${result.subtype}: ${oneLine(why)}` }
      }
      return { kind: 'failed', reason: `claude: exited with code ${exitCode}: ${lastLine(stderrTail)}` }
    },
  }
}

/** Claude Code, run headless (`claude -p … stream-json`). The flags were checked against 2.1.316. */
export const claudeRunner: Runner = {
  vendor: 'claude',
  command: 'claude',
  args(request) {
    // The prompt goes in on stdin; `-p` reads it from there.
    const common = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', PERMISSION_MODE[request.access]]
    if (request.resume !== null) return [...common, '--resume', request.resume]
    return request.access === 'worktree' ? [...common, '--worktree'] : common
  },
  createParser: createClaudeParser,
}
