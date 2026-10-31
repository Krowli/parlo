import { describe, expect, it } from 'vitest'

import { callerKey, colleagueEnv } from './identity'

describe('callerKey', () => {
  it('prefers the Codex session, which is the innermost when both are set', () => {
    expect(callerKey({ CODEX_THREAD_ID: 'cx-1', CLAUDE_CODE_SESSION_ID: 'cl-1' }, 42)).toEqual({ vendor: 'codex', vendorSessionId: 'cx-1' })
  })

  it('uses the Claude Code session', () => {
    expect(callerKey({ CLAUDE_CODE_SESSION_ID: 'cl-1' }, 42)).toEqual({ vendor: 'claude', vendorSessionId: 'cl-1' })
  })

  it('falls back to the parent shell', () => {
    expect(callerKey({}, 42)).toEqual({ vendor: 'shell', vendorSessionId: 'ppid:42' })
  })
})

describe('colleagueEnv', () => {
  it('drops the caller identity and keeps everything else', () => {
    const env = colleagueEnv({
      PATH: '/bin',
      CODEX_THREAD_ID: 'cx-1',
      CODEX_SESSION_ID: 'cx-1',
      CLAUDE_CODE_SESSION_ID: 'cl-1',
      CLAUDECODE: '1',
      CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
      CLAUDE_CODE_USE_BEDROCK: '1',
    })
    expect(env).toEqual({ PATH: '/bin', CLAUDE_CODE_USE_BEDROCK: '1' })
  })
})
