import { readFileSync } from 'node:fs'

import { Command, CommanderError, InvalidArgumentError, Option } from 'commander'

import { EXIT, ParloError } from '../errors'
import { packagePath } from '../package-path'
import type { Access, ColleagueVendor } from '../runners/types'
import { ask } from './commands/ask'

const { version } = JSON.parse(readFileSync(packagePath('package.json'), 'utf8')) as { version: string }

function colleagueArgument(value: string): ColleagueVendor {
  if (value === 'claude' || value === 'codex') return value
  throw new InvalidArgumentError('the colleague is claude or codex')
}

function accessOf(flags: { write?: boolean; worktree?: boolean }): Access | null {
  if (flags.worktree) return 'worktree'
  if (flags.write) return 'write'
  return null
}

function buildProgram(): Command {
  const program = new Command('parlo')
    .description('Ask another coding agent for help: Claude Code asks Codex, Codex asks Claude Code.')
    .version(version)
    .exitOverride()

  program.command('ask')
    .description('Ask a colleague and print its reply.')
    .argument('<colleague>', 'claude or codex', colleagueArgument)
    .argument('<message...>', 'what to ask; the colleague sees nothing else')
    .addOption(new Option('--write', 'let the colleague change files in this directory').conflicts('worktree'))
    .option('--worktree', 'let the colleague change files in its own git worktree')
    .action(async (colleague: ColleagueVendor, words: string[], flags: { write?: boolean; worktree?: boolean }) => {
      process.exitCode = await ask(colleague, words.join(' '), { access: accessOf(flags) ?? 'read' })
    })

  return program
}

try {
  await buildProgram().parseAsync(process.argv)
}
catch (error) {
  if (error instanceof CommanderError) {
    // commander has already printed the message.
    process.exitCode = error.exitCode === 0 ? EXIT.ok : EXIT.usage
  }
  else if (error instanceof ParloError) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = error.exitCode
  }
  else {
    throw error
  }
}
