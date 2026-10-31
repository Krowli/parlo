import { EXIT, type ExitCode } from '../../errors'
import { callerKey } from '../../identity'
import { oneLine } from '../../runners/text'
import { openStore } from '../../store/open'
import { listThreads } from '../../store/reads'

export function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function threadsCommand(): ExitCode {
  const { db, close } = openStore()
  try {
    const rows = listThreads(db, callerKey())
    if (rows.length === 0) {
      process.stdout.write('parlo: no threads yet.\n')
      return EXIT.ok
    }
    for (const row of rows) {
      const failure = row.failure === null ? '' : `  (${row.failure})`
      process.stdout.write(`#${row.id}  ${row.vendor.padEnd(6)}  ${row.status.padEnd(7)}  ${String(row.messageCount).padStart(2)} messages  ${clock(row.lastAt)}  "${oneLine(row.firstAsk, 60)}"${failure}\n`)
    }
    return EXIT.ok
  }
  finally {
    close()
  }
}
