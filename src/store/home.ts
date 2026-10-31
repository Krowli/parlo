import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where parlo keeps its file: `~/.parlo`, or `$PARLO_HOME` (tests use it). */
export function parloHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.PARLO_HOME ?? join(homedir(), '.parlo')
}
