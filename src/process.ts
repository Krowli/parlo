/** Signal a colleague and everything it started: it runs as the leader of its own process group. */
export function killGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error
    }
  }
}

/** Whether a process exists. EPERM means it exists but belongs to someone else. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Fires when this process is told to stop (the person stops the task in
 * `/tasks`, Claude Code exits, Ctrl+C), so the colleague it started stops too.
 */
export function abortOnSignals(): AbortSignal {
  const controller = new AbortController()
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.once(signal, () => controller.abort())
  }
  return controller.signal
}
