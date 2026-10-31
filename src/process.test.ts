import { spawn } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { killGroup } from './process'

describe('killGroup', () => {
  it('does not throw for a group that already exited and is not yet reaped', () => {
    // Claude Code stopping a task kills the colleague's group first; parlo's own
    // SIGTERM handler then signals a group of zombies. macOS answers that with EPERM.
    const child = spawn('sh', ['-c', 'exit 0'], { detached: true, stdio: 'ignore' })
    const until = Date.now() + 300
    while (Date.now() < until) {
      // Block the event loop so Node can't reap the child: it stays a zombie.
    }
    expect(() => killGroup(child.pid!)).not.toThrow()
  })
})
