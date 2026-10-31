import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { testEnv } from '../testing/env'
import { runCli } from '../testing/run-cli'

const skill = readFileSync(packagePath('skills/parlo/SKILL.md'), 'utf8')

function home() {
  const dir = mkdtempSync(join(tmpdir(), 'parlo-user-'))
  const env = testEnv({ HOME: dir, PARLO_HOME: join(dir, '.parlo') })
  delete env.CODEX_HOME // the developer's own Codex home must not be touched
  return { dir, env }
}

describe('parlo connect', () => {
  it('installs the skill for Claude Code', async () => {
    const { dir, env } = home()
    const result = await runCli(['connect', 'claude', '--yes'], env)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('create    ~/.claude/skills/parlo/SKILL.md')
    expect(readFileSync(join(dir, '.claude/skills/parlo/SKILL.md'), 'utf8')).toBe(skill)
  })

  it('installs the skill and the sandbox rule for Codex, honouring CODEX_HOME', async () => {
    const { dir, env } = home()
    const codexHome = join(dir, 'codex-home')
    const result = await runCli(['connect', 'codex', '--yes'], { ...env, CODEX_HOME: codexHome })
    expect(result.code).toBe(0)
    expect(readFileSync(join(dir, '.agents/skills/parlo/SKILL.md'), 'utf8')).toBe(skill)
    expect(readFileSync(join(codexHome, 'rules/parlo.rules'), 'utf8')).toContain('prefix_rule(pattern = ["parlo"], decision = "allow")')
  })

  it('says when it is already connected', async () => {
    const { env } = home()
    await runCli(['connect', 'claude', '--yes'], env)
    expect((await runCli(['connect', 'claude', '--yes'], env)).stdout).toContain('parlo is already connected to claude.')
  })

  it('refuses to apply without a terminal or --yes', async () => {
    const { dir, env } = home()
    const result = await runCli(['connect', 'claude'], env)
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('run it again with --yes')
    expect(existsSync(join(dir, '.claude/skills/parlo'))).toBe(false)
  })

  it('disconnect removes what connect added', async () => {
    const { dir, env } = home()
    await runCli(['connect', 'codex', '--yes'], env)
    const result = await runCli(['disconnect', 'codex'], env)
    expect(result.code).toBe(0)
    expect(existsSync(join(dir, '.agents/skills/parlo'))).toBe(false)
    expect(existsSync(join(dir, '.codex/rules/parlo.rules'))).toBe(false)
  })
})
