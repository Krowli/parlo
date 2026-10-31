/** Exit codes every parlo command uses. The skill tells agents what each one means. */
export const EXIT = {
  ok: 0,
  failed: 1,
  usage: 2,
  refused: 3,
  stillWorking: 4,
  stopped: 5,
} as const

export type ExitCode = (typeof EXIT)[keyof typeof EXIT]

/** A failure parlo explains in one line and exits with. */
export class ParloError extends Error {
  constructor(message: string, readonly exitCode: ExitCode) {
    super(message)
  }
}
