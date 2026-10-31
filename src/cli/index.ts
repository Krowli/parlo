import { readFileSync } from 'node:fs'

import { Command, CommanderError, InvalidArgumentError, Option } from 'commander'

import { EXIT, ParloError } from '../errors'
import { packagePath } from '../package-path'
import type { Access, ColleagueVendor } from '../runners/types'
import { ask } from './commands/ask'
import { connectCommand, disconnectCommand } from './commands/connect'
import { runCommand } from './commands/run'
import { showCommand } from './commands/show'
import { stopCommand } from './commands/stop'
import { threadsCommand } from './commands/threads'
import { uninstallCommand } from './commands/uninstall'
import { waitCommand } from './commands/wait'

const { version } = JSON.parse(readFileSync(packagePath('package.json'), 'utf8')) as { version: string }

function colleagueArgument(value: string): ColleagueVendor {
  if (value === 'claude' || value === 'codex') return value
  throw new InvalidArgumentError('the colleague is claude or codex')
}

function threadArgument(value: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw new InvalidArgumentError('a thread is a positive number')
  return id
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
    .option('--thread <id>', 'continue a thread you started', threadArgument)
    .addOption(new Option('--write', 'let the colleague change files in this directory').conflicts('worktree'))
    .option('--worktree', 'let the colleague change files in its own git worktree')
    .option('--detach', 'start the colleague and return at once; get the reply with parlo wait')
    .action(async (colleague: ColleagueVendor, words: string[], flags: { thread?: number; write?: boolean; worktree?: boolean; detach?: boolean }) => {
      process.exitCode = await ask(colleague, words.join(' '), { thread: flags.thread ?? null, access: accessOf(flags), detach: flags.detach === true })
    })

  program.command('wait')
    .description('Wait for a thread\'s reply (exit 4 if it is still working).')
    .argument('<thread>', 'the thread number', threadArgument)
    .option('--timeout <seconds>', 'how long to wait', value => Number(value), 25)
    .action(async (threadId: number, flags: { timeout: number }) => {
      process.exitCode = await waitCommand(threadId, flags.timeout)
    })

  program.command('__run', { hidden: true })
    .argument('<thread>', 'the thread number', threadArgument)
    .action(async (threadId: number) => { process.exitCode = await runCommand(threadId) })

  program.command('threads')
    .description('List the threads in this agent tree.')
    .action(() => { process.exitCode = threadsCommand() })

  program.command('show')
    .description('Print a whole thread.')
    .argument('<thread>', 'the thread number', threadArgument)
    .action((threadId: number) => { process.exitCode = showCommand(threadId) })

  program.command('stop')
    .description('Stop a thread and everything under it, or every running thread.')
    .addOption(new Option('--thread <id>', 'the thread to stop').argParser(threadArgument).conflicts('all'))
    .option('--all', 'stop every running thread')
    .action((flags: { thread?: number; all?: boolean }) => {
      if (flags.thread === undefined && !flags.all) throw new ParloError('parlo: say which: --thread <id> or --all', EXIT.usage)
      process.exitCode = stopCommand(flags.thread === undefined ? { all: true } : { thread: flags.thread })
    })

  program.command('connect')
    .description('Install the parlo skill into an agent (and, for Codex, the rule that lets parlo run outside its sandbox).')
    .argument('<agent>', 'claude or codex', colleagueArgument)
    .option('--yes', 'apply without asking')
    .action(async (agent: ColleagueVendor, flags: { yes?: boolean }) => {
      process.exitCode = await connectCommand(agent, { yes: flags.yes === true })
    })

  program.command('disconnect')
    .description('Remove what parlo connect installed.')
    .argument('<agent>', 'claude or codex', colleagueArgument)
    .action((agent: ColleagueVendor) => { process.exitCode = disconnectCommand(agent) })

  program.command('uninstall')
    .description('Stop every colleague and remove what parlo installed; then run npm uninstall -g parlo.')
    .option('--yes', 'remove without asking')
    .option('--purge', 'also delete ~/.parlo (asks in a terminal; --yes does not answer it)')
    .action(async (flags: { yes?: boolean; purge?: boolean }) => {
      process.exitCode = await uninstallCommand({ yes: flags.yes === true, purge: flags.purge === true })
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
