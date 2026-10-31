import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { testEnv, testPath } from '../testing/env'
import { fakeCli, type FakeRun } from '../testing/fake-cli'
import { runCli } from '../testing/run-cli'

const fixture = (name: string) => readFileSync(packagePath('src/testing/fixtures', name), 'utf8')

function setup(runs: FakeRun[] = [{ stdout: fixture('codex-reply.jsonl') }]) {
  const fake = fakeCli('codex', runs)
  const home = mkdtempSync(join(tmpdir(), 'parlo-home-'))
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'parlo-work-')))
  const env = testEnv({ PATH: testPath(fake.binDir), PARLO_HOME: home, CLAUDE_CODE_SESSION_ID: 'root-session' })
  return { fake, cwd, env, parlo: (...args: string[]) => runCli(args, env, cwd) }
}

describe('parlo ask', () => {
  it('opens a thread, shows progress and prints the reply last', async () => {
    const { parlo } = setup()
    const result = await parlo('ask', 'codex', 'What', 'is', 'here?')
    expect(result.code).toBe(0)
    expect(result.stderr.split('\n')[0]).toBe('parlo: thread 1 — asking codex (read only)')
    expect(result.stderr).toContain('codex: $ ls -la')
    expect(result.stdout).toBe([
      'parlo: codex answered on thread 1.',
      '----- reply -----',
      'pong',
      '----- end -----',
      'Continue with: parlo ask codex --thread 1 "<message>"',
      '',
    ].join('\n'))
  })

  it('continues the same Codex session on --thread, without the preamble', async () => {
    const { parlo, fake } = setup()
    await parlo('ask', 'codex', 'first')
    const result = await parlo('ask', 'codex', '--thread', '1', 'second')
    expect(result.code).toBe(0)
    const [first, second] = fake.calls()
    expect(first.stdin).toContain('parlo started you as a colleague')
    expect(second.argv).toEqual(['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-C', first.cwd, 'resume', '01a192ad-cd04-7480-9d95-797c1fc3c4ec', '-'])
    expect(second.stdin).toBe('second')
  })

  it('reports a colleague that fails', async () => {
    const { parlo } = setup([{ stdout: '', stderr: 'boom\n', exitCode: 1 }])
    const result = await parlo('ask', 'codex', 'q')
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('parlo: thread 1 failed: codex: exited with code 1: boom')
  })

  it('reports a colleague CLI that is not installed', async () => {
    const { env, cwd } = setup()
    const result = await runCli(['ask', 'codex', 'q'], { ...env, PATH: testPath() }, cwd)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('parlo: thread 1 failed: codex is not installed or not on PATH')
  })

  it('rejects an unknown colleague as a usage error', async () => {
    const { parlo } = setup()
    expect((await parlo('ask', 'gemini', 'q')).code).toBe(2)
  })
})

describe('parlo threads and show', () => {
  it('lists the threads of this tree and prints one', async () => {
    const { parlo } = setup()
    await parlo('ask', 'codex', 'What is here?')
    const list = await parlo('threads')
    expect(list.code).toBe(0)
    expect(list.stdout).toMatch(/^#1 {2}codex {3}idle {6}2 messages {2}\d\d:\d\d {2}"What is here\?"\n$/)
    const show = await parlo('show', '1')
    expect(show.code).toBe(0)
    expect(show.stdout).toContain('thread 1 with codex — idle (read only)')
    expect(show.stdout).toContain('you → codex:\nWhat is here?')
    expect(show.stdout).toContain('codex → you:\npong')
  })

  it('says when there are no threads', async () => {
    const { parlo } = setup()
    expect((await parlo('threads')).stdout).toBe('parlo: no threads yet.\n')
  })
})

describe('parlo ask claude', () => {
  it('asks Claude and records the cwd its init event reports', async () => {
    const fake = fakeCli('claude', [{ stdout: fixture('claude-reply.jsonl') }])
    const home = mkdtempSync(join(tmpdir(), 'parlo-home-'))
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'parlo-work-')))
    const env = testEnv({ PATH: testPath(fake.binDir), PARLO_HOME: home, CODEX_THREAD_ID: 'codex-root' })
    const result = await runCli(['ask', 'claude', 'q'], env, cwd)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('parlo: claude answered on thread 1.')
    expect(fake.calls()[0].argv).toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'plan'])
    expect(fake.calls()[0].stdin).toContain('(Codex)')
  })
})

describe('messages the shell would mangle', () => {
  const tricky = '- is this right?\n- and "this", $HOME and `that`?'

  it('reads the message from stdin with -, byte for byte', async () => {
    const { fake, env, cwd } = setup()
    const result = await runCli(['ask', 'codex', '-'], env, cwd, tricky)
    expect(result.code).toBe(0)
    expect(fake.calls()[0].stdin.endsWith(`--- message ---\n${tricky}`)).toBe(true)
  })

  it('takes a message that starts with a dash after --', async () => {
    const { fake, parlo } = setup()
    const result = await parlo('ask', 'codex', '--', '-x "quoted"')
    expect(result.code).toBe(0)
    expect(fake.calls()[0].stdin.endsWith('--- message ---\n-x "quoted"')).toBe(true)
  })

  it('says what to do when there is no message', async () => {
    const { parlo } = setup()
    const result = await parlo('ask', 'codex')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('parlo: say what to ask')
  })
})
