import { EXIT, type ExitCode } from '../../errors'
import { openStore } from '../../store/open'
import { getThread } from '../../store/reads'
import { ACCESS_LABEL } from '../output'
import { clock } from './threads'

export function showCommand(threadId: number): ExitCode {
  const { db, close } = openStore()
  try {
    const { thread, vendor, messages } = getThread(db, threadId)
    const lines = [`thread ${threadId} with ${vendor} — ${thread.status} (${ACCESS_LABEL[thread.access]})`]
    if (thread.failure !== null) lines.push(`failure: ${thread.failure}`)
    for (const message of messages) {
      lines.push('', `[${clock(message.createdAt)}] ${message.fromColleague ? `${vendor} → you` : `you → ${vendor}`}:`, message.body)
    }
    process.stdout.write(`${lines.join('\n')}\n`)
    return EXIT.ok
  }
  finally {
    close()
  }
}
