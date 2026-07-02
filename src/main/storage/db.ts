// src/main/storage/db.ts
// SQLite singleton for the Electron main process.
// Call initDb() on app start. Use getDb() everywhere else.
// openDb(path) is exported for unit tests (accepts ':memory:').
//
// NOTE: Never import this in the renderer process.

import Database from 'better-sqlite3'
import { join } from 'path'

let _db: Database.Database | null = null

// ─── Public API ───────────────────────────────────────────────────────────────

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

/**
 * Open a database at the given path and run outstanding migrations.
 * Exported for unit tests — pass ':memory:' for an in-memory database.
 */
export function openDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

/** Initialize the application database. Must be called before app windows are shown. */
export function initDb(): void {
  // Lazy require keeps `electron` out of the top-level scope so tests can
  // call openDb() without needing Electron available.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  const dbPath = join(app.getPath('userData'), 'timmy.db')
  _db = openDb(dbPath)
}

export function closeDb(): void {
  _db?.close()
  _db = null
}

// ─── Migrations ───────────────────────────────────────────────────────────────

// Migrations are embedded as strings so they survive electron-vite bundling
// without needing to copy .sql files to the output directory.
const MIGRATIONS: { filename: string; sql: string }[] = [
  {
    filename: '001_initial.sql',
    sql: `
      CREATE TABLE IF NOT EXISTS config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_blocks (
        id               TEXT    PRIMARY KEY,
        date             TEXT    NOT NULL,
        start_time       TEXT    NOT NULL,
        end_time         TEXT,
        title            TEXT    NOT NULL,
        notes            TEXT,
        project_id       TEXT,
        work_order_id    TEXT,
        source           TEXT    NOT NULL DEFAULT 'manual',
        source_id        TEXT,
        duration_minutes REAL,
        decimal_hours    REAL,
        deleted          INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT    NOT NULL,
        updated_at       TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_time_blocks_date ON time_blocks(date);

      CREATE TABLE IF NOT EXISTS day_boundaries (
        date       TEXT PRIMARY KEY,
        start_time TEXT NOT NULL,
        end_time   TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id          TEXT    PRIMARY KEY,
        name        TEXT    NOT NULL,
        client_name TEXT    NOT NULL,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS work_orders (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        code        TEXT NOT NULL,
        label       TEXT NOT NULL,
        description TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS submit_log (
        id           TEXT    PRIMARY KEY,
        date         TEXT    NOT NULL,
        submitted_at TEXT    NOT NULL,
        entry_count  INTEGER NOT NULL,
        status       TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_tasks (
        id        TEXT    PRIMARY KEY,
        title     TEXT    NOT NULL UNIQUE,
        last_used TEXT    NOT NULL,
        use_count INTEGER NOT NULL DEFAULT 1
      );

      INSERT OR IGNORE INTO config (key, value) VALUES (
        'app',
        '{"anchorPosition":"BR","anchorMode":"full","quickCaptureShortcut":"CommandOrControl+Shift+Space","theme":"dark","glassIntensity":80,"undoStackDepth":20,"connectors":[],"submitFieldMap":null}'
      );
    `,
  },
  {
    filename: '002_calendar.sql',
    sql: `
      CREATE TABLE IF NOT EXISTS calendar_events (
        id                   TEXT    PRIMARY KEY,
        date                 TEXT    NOT NULL,
        start_time           TEXT,
        end_time             TEXT,
        title                TEXT    NOT NULL,
        organizer            TEXT,
        is_all_day           INTEGER NOT NULL DEFAULT 0,
        source_id            TEXT    NOT NULL,
        imported_to_timeline INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);

      CREATE TABLE IF NOT EXISTS connector_tokens (
        connector     TEXT PRIMARY KEY,
        token_data    TEXT NOT NULL,
        account_email TEXT,
        updated_at    TEXT NOT NULL
      );
    `,
  },
]

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT filename FROM migrations').all() as { filename: string }[]).map(
      (r) => r.filename,
    ),
  )

  const insert = db.prepare(
    'INSERT INTO migrations (filename, applied_at) VALUES (?, ?)',
  )

  for (const { filename, sql } of MIGRATIONS) {
    if (applied.has(filename)) continue
    db.exec(sql)
    insert.run(filename, new Date().toISOString())
  }
}
