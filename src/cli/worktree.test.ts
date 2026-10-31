import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { testEnv, testPath } from '../testing/env'
import { fakeCli } from '../testing/fake-cli'
import { runCli } from '../testing/run-cli'

const fixture = (name: string) => readFileSync(packagePath('src/testing/fixtures', name), 'utf8')

function repo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'parlo-repo-')))
  writeFileSync(join(dir, 'app.py'), 'print("hi")\n')
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir })
  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'init')
  return dir
}

describe('a Codex colleague with --worktree', () => {
  it('works in a worktree parlo made, on the first turn and every follow-up', async () => {
    const fake = fakeCli('codex', [{ stdout: fixture('codex-reply.jsonl') }])
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'parlo-home-')))
    const cwd = repo()
    const env = testEnv({ PATH: testPath(fake.binDir), PARLO_HOME: home, CLAUDE_CODE_SESSION_ID: 'root-session' })
    expect((await runCli(['ask', 'codex', '--worktree', 'change it'], env, cwd)).code).toBe(0)
    expect((await runCli(['ask', 'codex', '--thread', '1', 'and again'], env, cwd)).code).toBe(0)
    const worktree = join(home, 'worktrees', '1')
    const [first, second] = fake.calls()
    expect(first.cwd).toBe(worktree)
    expect(first.argv).toEqual(['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-C', worktree, '-'])
    expect(second.cwd).toBe(worktree)
    expect(second.argv).toEqual(['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-C', worktree, 'resume', '01a192ad-cd04-7480-9d95-797c1fc3c4ec', '-'])
    expect(execFileSync('git', ['worktree', 'list'], { cwd, encoding: 'utf8' })).toContain(worktree)
  })

  it('fails with a plain reason outside a git repository', async () => {
    const fake = fakeCli('codex', [{ stdout: fixture('codex-reply.jsonl') }])
    const env = testEnv({ PATH: testPath(fake.binDir), PARLO_HOME: mkdtempSync(join(tmpdir(), 'parlo-home-')), CLAUDE_CODE_SESSION_ID: 'root-session' })
    const result = await runCli(['ask', 'codex', '--worktree', 'q'], env, realpathSync(mkdtempSync(join(tmpdir(), 'parlo-plain-'))))
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('parlo: thread 1 failed: --worktree needs a git repository with at least one commit')
    expect(fake.calls()).toHaveLength(0)
  })
})
