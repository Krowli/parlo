import { EXIT, type ExitCode } from '../../errors'
import { callerKey, colleagueEnv } from '../../identity'
import { LIMITS } from '../../limits'
import { firstPrompt } from '../../preamble'
import { abortOnSignals } from '../../process'
import { runColleague } from '../../run-colleague'
import { runnerFor } from '../../runners'
import type { Access, ColleagueVendor } from '../../runners/types'
import { ACCESS_LABEL, replyBlock } from '../output'

export async function ask(vendor: ColleagueVendor, message: string, flags: { access: Access }): Promise<ExitCode> {
  process.stderr.write(`parlo: asking ${vendor} (${ACCESS_LABEL[flags.access]})\n`)
  const outcome = await runColleague(
    runnerFor(vendor),
    { prompt: firstPrompt(message, flags.access, callerKey().vendor), access: flags.access, cwd: process.cwd(), resume: null },
    { onProgress: line => process.stderr.write(`${line}\n`) },
    { deadlineMs: LIMITS.replyDeadlineMs, env: colleagueEnv(), signal: abortOnSignals() },
  )
  switch (outcome.kind) {
    case 'reply':
      process.stdout.write(replyBlock({ vendor, threadId: null, text: outcome.text }))
      return EXIT.ok
    case 'failed':
      process.stderr.write(`parlo: ${outcome.reason}\n`)
      return EXIT.failed
    case 'timeout':
      process.stderr.write(`parlo: ${vendor} did not answer within 30 minutes and was stopped.\n`)
      return EXIT.failed
    case 'stopped':
      process.stderr.write('parlo: stopped.\n')
      return EXIT.stopped
  }
}
