import { EXIT, type ExitCode } from '../errors'
import type { Db } from '../store/db'
import { getThread } from '../store/reads'
import { replyBlock } from './output'

/** Print where a thread stands: the reply on stdout, anything else as one line on stderr. */
export function reportThread(db: Db, threadId: number): ExitCode {
  const { thread, vendor, messages } = getThread(db, threadId)
  switch (thread.status) {
    case 'idle':
      // An idle thread ends with its colleague's reply.
      process.stdout.write(replyBlock({ vendor, threadId, text: messages.at(-1)!.body }))
      return EXIT.ok
    case 'failed':
      process.stderr.write(`parlo: thread ${threadId} failed: ${thread.failure}\n`)
      return EXIT.failed
    case 'stopped':
      process.stderr.write(`parlo: thread ${threadId} was stopped.\n`)
      return EXIT.stopped
    case 'running':
      process.stderr.write(`parlo: thread ${threadId} is still working. Run: parlo wait ${threadId}\n`)
      return EXIT.stillWorking
  }
}
