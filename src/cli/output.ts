import type { Vendor } from '../identity'
import type { Access } from '../runners/types'

export const REPLY_START = '----- reply -----'
export const REPLY_END = '----- end -----'

export const ACCESS_LABEL: Record<Access, string> = { read: 'read only', write: 'may write here', worktree: 'own worktree' }

/** The block an agent reads when its colleague answered. The reply is last, between markers (spike result 3). */
export function replyBlock(reply: { vendor: Vendor; threadId: number | null; text: string }): string {
  const lines = [
    reply.threadId === null ? `parlo: ${reply.vendor} answered.` : `parlo: ${reply.vendor} answered on thread ${reply.threadId}.`,
    REPLY_START,
    reply.text,
    REPLY_END,
  ]
  if (reply.threadId !== null) {
    lines.push(`Continue with: parlo ask ${reply.vendor} --thread ${reply.threadId} "<message>"`)
  }
  return `${lines.join('\n')}\n`
}
