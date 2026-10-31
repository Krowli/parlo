import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { codexRunner } from './codex'

const fixture = (name: string) => readFileSync(packagePath('src/testing/fixtures', name), 'utf8').split('\n').filter(Boolean)

describe('codexRunner.args', () => {
  it('starts a read-only session with the prompt on stdin', () => {
    expect(codexRunner.args({ prompt: 'x', access: 'read', cwd: '/w', resume: null }))
      .toEqual(['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-C', '/w', '-'])
  })

  it('runs a worktree session in the worktree parlo made, and lets it write there', () => {
    expect(codexRunner.args({ prompt: 'x', access: 'worktree', cwd: '/home/.parlo/worktrees/1', resume: null }))
      .toEqual(['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-C', '/home/.parlo/worktrees/1', '-'])
  })

  it('resumes with the sandbox and directory given again, as the Codex SDK does on every turn', () => {
    expect(codexRunner.args({ prompt: 'x', access: 'read', cwd: '/w', resume: 'sid' }))
      .toEqual(['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-C', '/w', 'resume', 'sid', '-'])
  })
})

describe('codexRunner parser', () => {
  it('reads the session, the steps and the reply', () => {
    const parser = codexRunner.createParser()
    const events = fixture('codex-reply.jsonl').flatMap(line => parser.push(line))
    expect(events).toEqual([
      { kind: 'session', sessionId: '01a192ad-cd04-7480-9d95-797c1fc3c4ec' },
      { kind: 'progress', line: 'codex: I’ll look at the directory first.' },
      { kind: 'progress', line: 'codex: $ ls -la' },
      { kind: 'progress', line: 'codex: pong' },
    ])
    expect(parser.end(0, '')).toEqual({ kind: 'reply', text: 'pong' })
  })

  it('reports a failed turn', () => {
    const parser = codexRunner.createParser()
    fixture('codex-failed.jsonl').forEach(line => parser.push(line))
    expect(parser.end(1, '')).toEqual({ kind: 'failed', reason: 'codex: stream disconnected before completion' })
  })

  it('ignores lines that are not JSON and says when there was no reply', () => {
    const parser = codexRunner.createParser()
    fixture('codex-noise.jsonl').forEach(line => parser.push(line))
    expect(parser.end(0, '')).toEqual({ kind: 'failed', reason: 'codex: ended without a reply' })
  })

  it('names the exit code and the last stderr line', () => {
    const parser = codexRunner.createParser()
    expect(parser.end(2, 'first\nnot logged in\n')).toEqual({ kind: 'failed', reason: 'codex: exited with code 2: not logged in' })
  })
})

describe('codexRunner parser, broken input', () => {
  it('skips a line that is not valid JSON instead of throwing (a cut or garbled line)', () => {
    const parser = codexRunner.createParser()
    expect(parser.push('{not json')).toEqual([])
    fixture('codex-reply.jsonl').forEach(line => parser.push(line))
    expect(parser.end(0, '')).toEqual({ kind: 'reply', text: 'pong' })
  })
})
