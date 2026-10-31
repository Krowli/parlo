import { driveThread } from '../../drive-thread'
import { EXIT, type ExitCode } from '../../errors'
import { abortOnSignals } from '../../process'
import { openStore } from '../../store/open'

/** `parlo __run <thread>`: the detached runner `ask --detach` starts. Its stderr is the thread's log. */
export async function runCommand(threadId: number): Promise<ExitCode> {
  const { db, close } = openStore()
  try {
    await driveThread(db, threadId, line => process.stderr.write(`${line}\n`), abortOnSignals())
    return EXIT.ok
  }
  finally {
    close()
  }
}
