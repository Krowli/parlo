import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { EXIT, type ExitCode, ParloError } from '../../errors'
import { packagePath } from '../../package-path'
import type { ColleagueVendor } from '../../runners/types'

/** Spike result 4: lets Codex run parlo outside its sandbox, which has no network and can't write ~/.parlo. */
const RULE_HEADER = '# Written by `parlo connect codex`'

const CODEX_RULE = `${RULE_HEADER}; removed by \`parlo disconnect codex\`.
# Lets Codex run parlo outside its sandbox, so parlo can write ~/.parlo and
# the colleague it starts can reach its API.
prefix_rule(pattern = ["parlo"], decision = "allow")
`

export interface Install {
  path: string
  content: string
  /** What `disconnect` removes: the skill's own folder, or the rule file. */
  removes: string
  /** Whether what is at `path` now is parlo's: only then may it be removed. */
  isOurs(existing: string): boolean
}

const isParloSkill = (existing: string) => /^name: parlo$/m.test(existing)
const isParloRule = (existing: string) => existing.startsWith(RULE_HEADER)

export function installsFor(agent: ColleagueVendor): Install[] {
  const skill = readFileSync(packagePath('skills', 'parlo', 'SKILL.md'), 'utf8')
  if (agent === 'claude') {
    const folder = join(homedir(), '.claude', 'skills', 'parlo')
    return [{ path: join(folder, 'SKILL.md'), content: skill, removes: folder, isOurs: isParloSkill }]
  }
  const folder = join(homedir(), '.agents', 'skills', 'parlo')
  const rule = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'rules', 'parlo.rules')
  return [
    { path: join(folder, 'SKILL.md'), content: skill, removes: folder, isOurs: isParloSkill },
    { path: rule, content: CODEX_RULE, removes: rule, isOurs: isParloRule },
  ]
}

export function tildify(path: string): string {
  return path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path
}

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new ParloError('parlo: there is no terminal to ask in; run it again with --yes to apply.', EXIT.usage)
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt.question(`${question} [y/N] `)
  prompt.close()
  return /^y(es)?$/i.test(answer.trim())
}

export async function connectCommand(agent: ColleagueVendor, flags: { yes: boolean }): Promise<ExitCode> {
  const changes = installsFor(agent).map(install => ({
    ...install,
    state: !existsSync(install.path) ? 'create' : readFileSync(install.path, 'utf8') === install.content ? 'unchanged' : 'update',
  }))
  for (const change of changes) {
    process.stdout.write(`  ${change.state.padEnd(9)} ${tildify(change.path)}\n`)
  }
  if (changes.every(change => change.state === 'unchanged')) {
    process.stdout.write(`parlo is already connected to ${agent}.\n`)
    return EXIT.ok
  }
  if (!flags.yes && !(await confirm('Apply these changes?'))) {
    process.stdout.write('parlo: nothing changed.\n')
    return EXIT.ok
  }
  for (const change of changes.filter(change => change.state !== 'unchanged')) {
    mkdirSync(dirname(change.path), { recursive: true })
    writeFileSync(change.path, change.content)
  }
  process.stdout.write(`parlo is connected to ${agent}. Start a new ${agent === 'claude' ? 'Claude Code' : 'Codex'} session to load it.\n`)
  return EXIT.ok
}

/** What is there to remove for these installs: parlo's own files, and the ones at its paths that someone else wrote. */
export function removable(installs: Install[]): { ours: Install[]; theirs: Install[] } {
  const present = installs.filter(install => existsSync(install.removes))
  const ours = present.filter(install => existsSync(install.path) && install.isOurs(readFileSync(install.path, 'utf8')))
  return { ours, theirs: present.filter(install => !ours.includes(install)) }
}

export function reportSkipped(theirs: Install[]): void {
  for (const install of theirs) {
    process.stdout.write(`  skipped   ${tildify(install.removes)} (not written by parlo; remove it yourself if you want it gone)\n`)
  }
}

export function disconnectCommand(agent: ColleagueVendor): ExitCode {
  const { ours, theirs } = removable(installsFor(agent))
  for (const install of ours) {
    rmSync(install.removes, { recursive: true, force: true })
    process.stdout.write(`  removed   ${tildify(install.removes)}\n`)
  }
  reportSkipped(theirs)
  process.stdout.write(ours.length === 0 ? `parlo was not connected to ${agent}.\n` : `parlo is disconnected from ${agent}.\n`)
  return EXIT.ok
}
