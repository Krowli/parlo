import type { RunResult } from 'better-sqlite3'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import type * as schema from './schema'

/** The open database or a transaction on it: every store function takes either. */
export type Db = BaseSQLiteDatabase<'sync', RunResult, typeof schema>
