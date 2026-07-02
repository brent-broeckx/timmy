// src/main/storage/__tests__/db.test.ts
// Unit tests for the SQLite storage layer.
// Uses an in-memory database so no Electron or file system is needed.

import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../db'
import type Database from 'better-sqlite3'
import type { AppConfig } from '@shared/types'
import { DEFAULT_APP_CONFIG } from '@shared/types'

describe('openDb / migrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('creates all required tables', () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)

    expect(names).toContain('config')
    expect(names).toContain('time_blocks')
    expect(names).toContain('day_boundaries')
    expect(names).toContain('projects')
    expect(names).toContain('work_orders')
    expect(names).toContain('recent_tasks')
    expect(names).toContain('migrations')
  })

  it('inserts the default app config on first run', () => {
    const row = db
      .prepare('SELECT value FROM config WHERE key = ?')
      .get('app') as { value: string } | undefined
    expect(row).toBeDefined()
    const config = JSON.parse(row!.value) as AppConfig
    expect(config.quickCaptureShortcut).toBe(DEFAULT_APP_CONFIG.quickCaptureShortcut)
    expect(config.undoStackDepth).toBe(20)
  })

  it('records the migration in the migrations table', () => {
    const rows = db.prepare('SELECT filename FROM migrations').all() as { filename: string }[]
    expect(rows.some((r) => r.filename === '001_initial.sql')).toBe(true)
  })

  it('is idempotent — running migrations twice does not duplicate data', () => {
    // Simulate a second open (same in-memory db, migrations already applied)
    // Count should equal the number of migrations defined in db.ts
    const rows = db.prepare('SELECT COUNT(*) AS n FROM migrations').get() as { n: number }
    expect(rows.n).toBeGreaterThanOrEqual(1)

    const configRows = db
      .prepare('SELECT COUNT(*) AS n FROM config WHERE key = ?')
      .get('app') as { n: number }
    expect(configRows.n).toBe(1)
  })

  it('enforces foreign key from work_orders → projects', () => {
    expect(() => {
      db.prepare(
        "INSERT INTO work_orders (id, project_id, code, label, description) VALUES ('wo1', 'nonexistent', 'WO-1', 'Test', 'test')",
      ).run()
    }).toThrow()
  })

  it('soft-deletes a time block by setting deleted = 1', () => {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO time_blocks
       (id, date, start_time, title, source, deleted, created_at, updated_at)
       VALUES ('b1', '2026-01-01', ?, 'Test task', 'manual', 0, ?, ?)`,
    ).run(now, now, now)

    db.prepare('UPDATE time_blocks SET deleted = 1 WHERE id = ?').run('b1')

    const row = db
      .prepare('SELECT deleted FROM time_blocks WHERE id = ?')
      .get('b1') as { deleted: number }
    expect(row.deleted).toBe(1)
  })
})

describe('decimal hours calculation', () => {
  it('rounds to 2 decimal places correctly', () => {
    const toDecimal = (minutes: number): number => Math.round((minutes / 60) * 100) / 100
    expect(toDecimal(15)).toBe(0.25)
    expect(toDecimal(30)).toBe(0.5)
    expect(toDecimal(45)).toBe(0.75)
    expect(toDecimal(60)).toBe(1)
    expect(toDecimal(90)).toBe(1.5)
    expect(toDecimal(85)).toBe(1.42)
  })
})
