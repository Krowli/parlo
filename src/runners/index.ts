import { claudeRunner } from './claude'
import { codexRunner } from './codex'
import type { ColleagueVendor, Runner } from './types'

const RUNNERS: Record<ColleagueVendor, Runner> = { claude: claudeRunner, codex: codexRunner }

export function runnerFor(vendor: ColleagueVendor): Runner {
  return RUNNERS[vendor]
}
