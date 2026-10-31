import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { EXIT, type ExitCode } from '../../errors'
import { parloHome } from '../../store/home'
import { openStore } from '../../store/open'
import { confirm, installsFor, removable, reportSkipped, tildify } from './connect'
import { stopTargets } from '../../stop'

const LAST_STEP = 'Last step: npm uninstall -g parlo'

/**
 * Take out everything parlo put on this machine while it is still installed:
 * npm runs no clean-up of its own. The data (`~/.parlo`) goes only on --purge
 * and a yes in a terminal; --yes doesn't answer that question (as in kanbo).
 */
export async function uninstallCommand(flags: { yes: boolean; purge: boolean }): Promise<ExitCode> {
  const home = parloHome()
  const hasStore = existsSync(join(home, 'parlo.db'))
  const { ours: installs, theirs } = removable((['claude', 'codex'] as const).flatMap(agent => installsFor(agent)))
  reportSkipped(theirs)
  if (installs.length === 0 && !hasStore) {
    process.stdout.write(`parlo: nothing to remove. ${LAST_STEP}\n`)
    return EXIT.ok
  }
  if (hasStore) process.stdout.write('  stop      every running colleague\n')
  for (const install of installs) process.stdout.write(`  remove    ${tildify(install.removes)}\n`)
  if (flags.purge && hasStore) process.stdout.write(`  delete    ${tildify(home)} (every thread and message), after one more question\n`)
  if (!flags.yes && !(await confirm('Remove these?'))) {
    process.stdout.write('parlo: nothing changed.\n')
    return EXIT.ok
  }

  if (hasStore) {
    const { db, close } = openStore(home)
    const stopped = stopTargets(db, { all: true })
    close()
    if (stopped.length > 0) process.stdout.write(`parlo: stopped ${stopped.map(id => `#${id}`).join(', ')}.\n`)
  }
  for (const install of installs) rmSync(install.removes, { recursive: true, force: true })

  if (flags.purge && hasStore) {
    if (!process.stdin.isTTY) {
      process.stdout.write(`parlo: kept ${tildify(home)}: deleting it needs a yes in a terminal.\n`)
    }
    else if (await confirm(`Delete ${tildify(home)} with every thread and message?`)) {
      rmSync(home, { recursive: true, force: true })
      process.stdout.write(`parlo: deleted ${tildify(home)}.\n`)
    }
  }
  process.stdout.write(`parlo: removed. ${LAST_STEP}\n`)
  return EXIT.ok
}
