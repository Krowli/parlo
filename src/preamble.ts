import type { Vendor } from './identity'
import type { Access } from './runners/types'

const CALLER_NAME: Record<Vendor, string> = { claude: 'Claude Code', codex: 'Codex', shell: 'a person at a terminal' }

const MAY: Record<Access, string> = {
  read: 'You may read files and run commands that change nothing. Do not edit files.',
  write: 'You may change files in this directory.',
  worktree: 'You work in your own git worktree and may change files there.',
}

/** The first message a colleague gets: who is asking, what it may do, and the ask itself. */
export function firstPrompt(message: string, access: Access, callerVendor: Vendor): string {
  return [
    `parlo started you as a colleague of another coding agent (${CALLER_NAME[callerVendor]}), which asks you the message below.`,
    'Answer it directly. Your final message is sent back to that agent as your whole reply, so make it complete on its own.',
    MAY[access],
    'If you are in plan mode, answer the question instead of writing a plan.',
    '',
    '--- message ---',
    message,
  ].join('\n')
}
