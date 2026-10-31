import { codexRunner } from './codex'
import type { ColleagueVendor, Runner } from './types'

const RUNNERS: Partial<Record<ColleagueVendor, Runner>> = { codex: codexRunner }

export function runnerFor(vendor: ColleagueVendor): Runner {
  const runner = RUNNERS[vendor]
  if (runner === undefined) {
    throw new Error(`parlo: no runner for ${vendor} yet`)
  }
  return runner
}
