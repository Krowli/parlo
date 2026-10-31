import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { EXIT, type ExitCode, ParloError } from '../../errors'
import { packagePath } from '../../package-path'
import type { ColleagueVendor } from '../../runners/types'

/** Spike result 4: lets Codex run parlo outside its sandbox, which has no network and can't write ~/.parlo. */
const RULE_HEADER = '# Written by `parlo connect codex`'

function codexRule(command: string[]): string {
  const lines = [
    `${RULE_HEADER}; removed by \`parlo disconnect codex\`.`,
    '# Lets Codex run parlo outside its sandbox, so parlo can write ~/.parlo and',
    '# the colleague it starts can reach its API.',
    'prefix_rule(pattern = ["parlo"], decision = "allow")',
  ]
  if (command.length > 1) {
    lines.push(`prefix_rule(pattern = ${JSON.stringify(command)}, decision = "allow")`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * How an agent's shell can start parlo. Agents run commands in a login shell
 * that builds its own PATH, and that PATH may not hold npm's global bin folder
 * (it didn't on the owner's Mac: Codex answered "command not found: parlo").
 * Checked with a clean environment, the way an agent app starts its shell.
 * When the login shell doesn't find `parlo`, agents get the full way to start
 * it: this Node and this package's own bin.
 */
export function agentCommand(): string[] {
  const shell = process.env.SHELL ?? '/bin/sh'
  const clean = { HOME: homedir(), USER: process.env.USER ?? '', LOGNAME: process.env.LOGNAME ?? '', SHELL: shell }
  const found = spawnSync(shell, ['-lc', 'command -v parlo'], { env: clean, encoding: 'utf8' })
  return found.status === 0 && found.stdout.trim() !== '' ? ['parlo'] : [process.execPath, packagePath('bin', 'parlo.mjs')]
}

function shellWord(word: string): string {
  return /^[\w./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`
}

/** The skill, plus, when agents can't find `parlo` on their PATH, how to start it on this machine. */
function skillFor(command: string[]): string {
  const skill = readFileSync(packagePath('skills', 'parlo', 'SKILL.md'), 'utf8')
  if (command.length === 1) return skill
  const run = command.map(shellWord).join(' ')
  return `${skill}
## Running parlo on this machine

The shell your commands run in doesn't find \`parlo\` on its PATH, so
\`parlo connect\` wrote down how to start it here. Wherever this skill says
\`parlo\`, run \`${run}\` instead. For example:

\`\`\`bash
${run} threads
\`\`\`

If that stops working (Node or parlo moved), the person runs \`parlo connect\` again.
`
}

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

export function installsFor(agent: ColleagueVendor, command: string[] = ['parlo']): Install[] {
  const skill = skillFor(command)
  if (agent === 'claude') {
    const folder = join(homedir(), '.claude', 'skills', 'parlo')
    return [{ path: join(folder, 'SKILL.md'), content: skill, removes: folder, isOurs: isParloSkill }]
  }
  const folder = join(homedir(), '.agents', 'skills', 'parlo')
  const rule = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'rules', 'parlo.rules')
  return [
    { path: join(folder, 'SKILL.md'), content: skill, removes: folder, isOurs: isParloSkill },
    { path: rule, content: codexRule(command), removes: rule, isOurs: isParloRule },
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
  const command = agentCommand()
  if (command.length > 1) {
    process.stdout.write(`parlo: agents on this machine can't find \`parlo\` on their PATH, so the skill${agent === 'codex' ? ' and the rule' : ''} will name it in full: ${command.map(shellWord).join(' ')}\n`)
  }
  const changes = installsFor(agent, command).map(install => ({
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
