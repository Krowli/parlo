import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { packagePath } from '../package-path'
import { testEnv } from '../testing/env'
import { runCli } from '../testing/run-cli'

const skill = readFileSync(packagePath('skills/parlo/SKILL.md'), 'utf8')

/** A stand-in for the user's login shell: one that finds `parlo` on its PATH, or one that doesn't. */
function loginShell(findsParlo: boolean): string {
  const file = join(mkdtempSync(join(tmpdir(), 'parlo-shell-')), 'sh')
  writeFileSync(file, findsParlo ? '#!/bin/sh\necho /usr/local/bin/parlo\n' : '#!/bin/sh\nexit 1\n')
  chmodSync(file, 0o755)
  return file
}

function home(findsParlo = true) {
  const dir = mkdtempSync(join(tmpdir(), 'parlo-user-'))
  const env = testEnv({ HOME: dir, PARLO_HOME: join(dir, '.parlo'), SHELL: loginShell(findsParlo) })
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

describe('removing only what parlo wrote', () => {
  it('keeps a rule file and a skill folder that parlo did not write', async () => {
    const { dir, env } = home()
    mkdirSync(join(dir, '.codex/rules'), { recursive: true })
    writeFileSync(join(dir, '.codex/rules/parlo.rules'), 'prefix_rule(pattern = ["parlo", "--yes"], decision = "allow")\n')
    mkdirSync(join(dir, '.agents/skills/parlo'), { recursive: true })
    writeFileSync(join(dir, '.agents/skills/parlo/SKILL.md'), '---\nname: parlo-notes\ndescription: someone else\n---\n')
    for (const command of [['disconnect', 'codex'], ['uninstall', '--yes']]) {
      const result = await runCli(command, env)
      expect(result.code).toBe(0)
      expect(result.stdout).toContain('skipped   ~/.codex/rules/parlo.rules (not written by parlo')
      expect(result.stdout).toContain('skipped   ~/.agents/skills/parlo (not written by parlo')
    }
    expect(existsSync(join(dir, '.codex/rules/parlo.rules'))).toBe(true)
    expect(existsSync(join(dir, '.agents/skills/parlo/SKILL.md'))).toBe(true)
  })
})

describe('when an agent\'s login shell does not find parlo', () => {
  const bin = packagePath('bin', 'parlo.mjs')

  it('writes the full way to start parlo into the skill and the Codex rule', async () => {
    const { dir, env } = home(false)
    const result = await runCli(['connect', 'codex', '--yes'], env)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('agents on this machine can\'t find `parlo` on their PATH')
    const installed = readFileSync(join(dir, '.agents/skills/parlo/SKILL.md'), 'utf8')
    expect(installed.startsWith(skill)).toBe(true)
    expect(installed).toContain(`run \`${process.execPath} ${bin}\` instead`)
    const rule = readFileSync(join(dir, '.codex/rules/parlo.rules'), 'utf8')
    expect(rule).toContain('prefix_rule(pattern = ["parlo"], decision = "allow")')
    expect(rule).toContain(`prefix_rule(pattern = ${JSON.stringify([process.execPath, bin])}, decision = "allow")`)
  })

  it('keeps the plain skill and rule when the login shell finds parlo', async () => {
    const { dir, env } = home(true)
    await runCli(['connect', 'codex', '--yes'], env)
    expect(readFileSync(join(dir, '.agents/skills/parlo/SKILL.md'), 'utf8')).toBe(skill)
    expect(readFileSync(join(dir, '.codex/rules/parlo.rules'), 'utf8')).not.toContain(bin)
  })
})
