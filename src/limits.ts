/** The ceilings `parlo ask` enforces. Values carried over from Aioomi ADE (`agent-peer/limits.ts`). */
export const LIMITS = {
  /** A root is depth 0, its colleague 1, that colleague's colleague 2. */
  maxDepth: 2,
  maxLiveColleagues: 3,
  maxThreadMessages: 20,
  maxMessageBytes: 256 * 1024,
  replyDeadlineMs: 30 * 60 * 1000,
} as const
