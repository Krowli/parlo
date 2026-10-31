import { driveThread } from '../../drive-thread'
import { EXIT, type ExitCode } from '../../errors'
import { abortOnSignals } from '../../process'
import { openStore } from '../../store/open'

/** `parlo __run <thread> <turn>`: the detached runner `ask --detach` starts. Its stderr is the thread's log. */
export async function runCommand(threadId: number, turn: number): Promise<ExitCode> {
  const { db, close } = openStore()
  try {
    const ran = await driveThread(db, threadId, turn, line => process.stderr.write(`${line}\n`), abortOnSignals())
    if (!ran) process.stderr.write(`parlo: thread ${threadId} no longer waits for turn ${turn}; nothing was started.\n`)
    return EXIT.ok
  }
  finally {
    close()
  }
}
