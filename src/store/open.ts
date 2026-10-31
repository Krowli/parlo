import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import { packagePath } from '../package-path'
import type { Db } from './db'
import { parloHome } from './home'
import * as schema from './schema'

export interface OpenStore {
  db: Db
  close(): void
}

/**
 * Two agents' first parlo runs can open an empty home at the same moment. On a
 * fresh file, `journal_mode = WAL` then fails with SQLITE_BUSY without waiting
 * for busy_timeout (seen in the race test), and drizzle's migrator would race
 * to create the same tables. A second SQLite file held in an exclusive
 * transaction makes both steps take turns.
 */
function prepareOnce(home: string, connection: Database.Database, db: BetterSQLite3Database<typeof schema>): void {
  const lock = new Database(join(home, 'migrate.lock'))
  lock.pragma('busy_timeout = 10000')
  lock.exec('BEGIN EXCLUSIVE')
  try {
    connection.pragma('journal_mode = WAL')
    migrate(db, { migrationsFolder: packagePath('drizzle') })
  }
  finally {
    lock.exec('COMMIT')
    lock.close()
  }
}

export function openStore(home: string = parloHome()): OpenStore {
  mkdirSync(home, { recursive: true })
  const connection = new Database(join(home, 'parlo.db'))
  connection.pragma('busy_timeout = 5000')
  connection.pragma('foreign_keys = ON')
  const db = drizzle(connection, { schema })
  prepareOnce(home, connection, db)
  return { db, close: () => connection.close() }
}
