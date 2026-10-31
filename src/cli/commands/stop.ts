import { EXIT, type ExitCode } from '../../errors'
import { stopTargets } from '../../stop'
import { openStore } from '../../store/open'

export function stopCommand(target: { thread: number } | { all: true }): ExitCode {
  const { db, close } = openStore()
  try {
    const stopped = stopTargets(db, target)
    process.stdout.write(stopped.length === 0 ? 'parlo: nothing was running.\n' : `parlo: stopped ${stopped.map(id => `#${id}`).join(', ')}.\n`)
    return EXIT.ok
  }
  finally {
    close()
  }
}
