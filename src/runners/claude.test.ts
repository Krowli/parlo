import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { claudeRunner } from './claude'

const fixture = (name: string) => readFileSync(packagePath('src/testing/fixtures', name), 'utf8').split('\n').filter(Boolean)
const common = ['-p', '--output-format', 'stream-json', '--verbose']

describe('claudeRunner.args', () => {
  it('keeps a read-only colleague in plan mode', () => {
    expect(claudeRunner.args({ prompt: 'x', access: 'read', cwd: '/w', resume: null })).toEqual([...common, '--permission-mode', 'plan'])
  })

  it('lets a worktree colleague edit in its own worktree', () => {
    expect(claudeRunner.args({ prompt: 'x', access: 'worktree', cwd: '/w', resume: null })).toEqual([...common, '--permission-mode', 'acceptEdits', '--worktree'])
  })

  it('resumes by session id', () => {
    expect(claudeRunner.args({ prompt: 'x', access: 'write', cwd: '/w', resume: 'sid' })).toEqual([...common, '--permission-mode', 'acceptEdits', '--resume', 'sid'])
  })
})

describe('claudeRunner parser', () => {
  it('reads the session and cwd, the steps and the reply', () => {
    const parser = claudeRunner.createParser()
    const events = fixture('claude-reply.jsonl').flatMap(line => parser.push(line))
    expect(events).toEqual([
      { kind: 'session', sessionId: '1e61bfe8-29fa-4e3a-ac28-a441f1c674d6', cwd: '/private/tmp/parlo-spike' },
      { kind: 'progress', line: 'claude: Bash ls -la' },
      { kind: 'progress', line: 'claude: pong' },
    ])
    expect(parser.end(0, '')).toEqual({ kind: 'reply', text: 'pong' })
  })

  it('reports an error result by its subtype', () => {
    const parser = claudeRunner.createParser()
    fixture('claude-error.jsonl').forEach(line => parser.push(line))
    expect(parser.end(1, '')).toEqual({ kind: 'failed', reason: 'claude: error_max_turns' })
  })

  it('reports a run with no result', () => {
    expect(claudeRunner.createParser().end(1, 'Invalid API key\n')).toEqual({ kind: 'failed', reason: 'claude: exited with code 1: Invalid API key' })
  })
})
