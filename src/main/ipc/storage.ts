// src/main/ipc/storage.ts
// All IPC handlers that touch the SQLite database.
// Registered once in main.ts via registerStorageHandlers().
//
// Rule: handlers are synchronous (better-sqlite3 is sync).
//       Every handler returns IpcResponse<T> — never throws to the renderer.

import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../storage/db'
import { getOverlayWindow, getAnchorWindow } from '../windows'
import { IPC } from '@shared/types'
import type {
  TimeBlock,
  DayBoundary,
  Project,
  WorkOrder,
  AppConfig,
  IpcResponse,
} from '@shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(data: T): IpcResponse<T> {
  return { data, error: null }
}

function fail<T>(err: unknown): IpcResponse<T> {
  return { data: null, error: err instanceof Error ? err.message : String(err) }
}

type BlockRow = {
  id: string
  date: string
  start_time: string
  end_time: string | null
  title: string
  notes: string | null
  project_id: string | null
  work_order_id: string | null
  source: string
  source_id: string | null
  duration_minutes: number | null
  decimal_hours: number | null
  deleted: number
  created_at: string
  updated_at: string
}

function rowToBlock(row: BlockRow): TimeBlock {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    notes: row.notes,
    projectId: row.project_id,
    workOrderId: row.work_order_id,
    source: row.source as TimeBlock['source'],
    sourceId: row.source_id,
    durationMinutes: row.duration_minutes,
    decimalHours: row.decimal_hours,
    deleted: row.deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerStorageHandlers(): void {
  registerConfigHandlers()
  registerTimelineHandlers()
  registerTaskHandlers()
  registerProjectHandlers()
}

// ─── Config ───────────────────────────────────────────────────────────────────

function registerConfigHandlers(): void {
  ipcMain.handle(IPC.CONFIG_GET, (): IpcResponse<AppConfig> => {
    try {
      const row = getDb()
        .prepare('SELECT value FROM config WHERE key = ?')
        .get('app') as { value: string } | undefined
      if (!row) return fail('Config row not found')
      return ok(JSON.parse(row.value) as AppConfig)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.CONFIG_SET, (_e, config: AppConfig): IpcResponse<void> => {
    try {
      getDb()
        .prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
        .run('app', JSON.stringify(config))
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function registerTimelineHandlers(): void {
  ipcMain.handle(IPC.TIMELINE_GET_DAY, (_e, date: string): IpcResponse<TimeBlock[]> => {
    try {
      const rows = getDb()
        .prepare(
          'SELECT * FROM time_blocks WHERE date = ? AND deleted = 0 ORDER BY start_time ASC',
        )
        .all(date) as BlockRow[]
      return ok(rows.map(rowToBlock))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.TIMELINE_GET_RANGE, (_e, fromDate: string, toDate: string): IpcResponse<TimeBlock[]> => {
    try {
      const rows = getDb()
        .prepare(
          'SELECT * FROM time_blocks WHERE date >= ? AND date <= ? AND deleted = 0 ORDER BY date ASC, start_time ASC',
        )
        .all(fromDate, toDate) as BlockRow[]
      return ok(rows.map(rowToBlock))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.TIMELINE_ADD_BLOCK, (_e, block: TimeBlock): IpcResponse<TimeBlock> => {
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const b: TimeBlock = { ...block, id: block.id || randomUUID(), createdAt: now, updatedAt: now }

      db.prepare(
          `INSERT OR IGNORE INTO time_blocks
           (id, date, start_time, end_time, title, notes, project_id, work_order_id,
            source, source_id, duration_minutes, decimal_hours, deleted, created_at, updated_at)
           VALUES
           (@id, @date, @startTime, @endTime, @title, @notes, @projectId, @workOrderId,
            @source, @sourceId, @durationMinutes, @decimalHours, 0, @createdAt, @updatedAt)`,
        )
        .run({
          id: b.id, date: b.date, startTime: b.startTime, endTime: b.endTime,
          title: b.title, notes: b.notes, projectId: b.projectId, workOrderId: b.workOrderId,
          source: b.source, sourceId: b.sourceId, durationMinutes: b.durationMinutes,
          decimalHours: b.decimalHours, createdAt: b.createdAt, updatedAt: b.updatedAt,
        })

      // Notify both renderers so they can sync running-task state
      getOverlayWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, b)
      getAnchorWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, b)
      return ok(b)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.TIMELINE_UPDATE_BLOCK, (_e, block: TimeBlock): IpcResponse<TimeBlock> => {
    try {
      const updated = { ...block, updatedAt: new Date().toISOString() }
      getDb()
        .prepare(
          `UPDATE time_blocks SET
             date = @date, start_time = @startTime,
             end_time = @endTime, title = @title, notes = @notes,
             project_id = @projectId, work_order_id = @workOrderId,
             duration_minutes = @durationMinutes, decimal_hours = @decimalHours,
             updated_at = @updatedAt
           WHERE id = @id`,
        )
        .run({
          date: updated.date, startTime: updated.startTime,
          endTime: updated.endTime, title: updated.title, notes: updated.notes,
          projectId: updated.projectId, workOrderId: updated.workOrderId,
          durationMinutes: updated.durationMinutes, decimalHours: updated.decimalHours,
          updatedAt: updated.updatedAt, id: updated.id,
        })
      // Notify both renderers so anchor/overlay stay in sync (e.g. running → stopped)
      getOverlayWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, updated)
      getAnchorWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, updated)
      return ok(updated)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.TIMELINE_DELETE_BLOCK, (_e, id: string): IpcResponse<void> => {
    try {
      getDb()
        .prepare('UPDATE time_blocks SET deleted = 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), id)
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  // Used by the undo system to restore a soft-deleted block
  ipcMain.handle(IPC.TIMELINE_RESTORE_BLOCK, (_e, id: string): IpcResponse<void> => {
    try {
      getDb()
        .prepare('UPDATE time_blocks SET deleted = 0, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), id)
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    IPC.TIMELINE_START_DAY,
    (_e, date: string, startTime: string): IpcResponse<DayBoundary> => {
      try {
        getDb()
          .prepare(
            'INSERT OR REPLACE INTO day_boundaries (date, start_time, end_time) VALUES (?, ?, NULL)',
          )
          .run(date, startTime)
        return ok({ date, startTime, endTime: null })
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(
    IPC.TIMELINE_END_DAY,
    (_e, date: string, endTime: string): IpcResponse<DayBoundary> => {
      try {
        const db = getDb()
        db.prepare('UPDATE day_boundaries SET end_time = ? WHERE date = ?').run(endTime, date)
        const row = db
          .prepare('SELECT * FROM day_boundaries WHERE date = ?')
          .get(date) as { date: string; start_time: string; end_time: string | null } | undefined
        if (!row) return fail('Day boundary not found')
        return ok({ date: row.date, startTime: row.start_time, endTime: row.end_time })
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(IPC.TIMELINE_GET_BOUNDARY, (_e, date: string): IpcResponse<DayBoundary | null> => {
    try {
      const row = getDb()
        .prepare('SELECT * FROM day_boundaries WHERE date = ?')
        .get(date) as { date: string; start_time: string; end_time: string | null } | undefined
      if (!row) return ok(null)
      return ok({ date: row.date, startTime: row.start_time, endTime: row.end_time })
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.TIMELINE_CONTINUE_DAY, (_e, date: string): IpcResponse<DayBoundary> => {
    try {
      const db = getDb()
      db.prepare('UPDATE day_boundaries SET end_time = NULL WHERE date = ?').run(date)
      const row = db
        .prepare('SELECT * FROM day_boundaries WHERE date = ?')
        .get(date) as { date: string; start_time: string; end_time: string | null } | undefined
      if (!row) return fail('Day boundary not found')
      return ok({ date: row.date, startTime: row.start_time, endTime: row.end_time })
    } catch (e) {
      return fail(e)
    }
  })
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

function registerTaskHandlers(): void {
  ipcMain.handle(IPC.TASK_START, (_e, title: string): IpcResponse<TimeBlock> => {
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const today = now.split('T')[0]
      const id = randomUUID()

      db.prepare(
        `INSERT INTO time_blocks
         (id, date, start_time, end_time, title, notes, project_id, work_order_id,
          source, source_id, duration_minutes, decimal_hours, deleted, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, NULL, NULL, NULL, 'manual', NULL, NULL, NULL, 0, ?, ?)`,
      ).run(id, today, now, title, now, now)

      // Track in recent_tasks (upsert by title)
      db.prepare(
        `INSERT INTO recent_tasks (id, title, last_used, use_count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(title) DO UPDATE SET last_used = excluded.last_used, use_count = use_count + 1`,
      ).run(randomUUID(), title, now)

      const block: TimeBlock = {
        id, date: today, startTime: now, endTime: null, title,
        notes: null, projectId: null, workOrderId: null,
        source: 'manual', sourceId: null,
        durationMinutes: null, decimalHours: null,
        deleted: false, createdAt: now, updatedAt: now,
      }
      getOverlayWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, block)
      getAnchorWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, block)
      return ok(block)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.TASK_STOP, (_e, id: string): IpcResponse<TimeBlock> => {
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const row = db
        .prepare('SELECT * FROM time_blocks WHERE id = ?')
        .get(id) as BlockRow | undefined
      if (!row) return fail(`Block ${id} not found`)

      // Idempotent: if already stopped or deleted, return current state without modification.
      // This prevents overwriting a user-set endTime when QuickCapture auto-stops currentTask.
      if (row.end_time !== null || row.deleted === 1) {
        const current = rowToBlock(row)
        getOverlayWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, current)
        getAnchorWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, current)
        return ok(current)
      }

      const durationMinutes = (new Date(now).getTime() - new Date(row.start_time).getTime()) / 60_000
      const decimalHours = Math.round((durationMinutes / 60) * 100) / 100

      db.prepare(
        'UPDATE time_blocks SET end_time = ?, duration_minutes = ?, decimal_hours = ?, updated_at = ? WHERE id = ?',
      ).run(now, durationMinutes, decimalHours, now, id)

      const stopped = rowToBlock(
        db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id) as BlockRow,
      )
      getOverlayWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, stopped)
      getAnchorWindow()?.webContents.send(IPC.STATE_TASK_CHANGED, stopped)
      return ok(stopped)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.TASK_GET_RECENT, (): IpcResponse<string[]> => {
    try {
      const rows = getDb()
        .prepare('SELECT title FROM recent_tasks ORDER BY last_used DESC LIMIT 20')
        .all() as { title: string }[]
      return ok(rows.map((r) => r.title))
    } catch (e) {
      return fail(e)
    }
  })
}

// ─── Projects & Work Orders ───────────────────────────────────────────────────

function registerProjectHandlers(): void {
  ipcMain.handle(IPC.PROJECT_LIST, (): IpcResponse<Project[]> => {
    try {
      const db = getDb()
      const projects = db
        .prepare('SELECT * FROM projects WHERE active = 1 ORDER BY name ASC')
        .all() as { id: string; name: string; client_name: string; active: number }[]
      const allWOs = db.prepare('SELECT * FROM work_orders').all() as {
        id: string; project_id: string; code: string; label: string; description: string
      }[]
      return ok(
        projects.map((p) => ({
          id: p.id, name: p.name, clientName: p.client_name, active: p.active === 1,
          workOrders: allWOs
            .filter((wo) => wo.project_id === p.id)
            .map((wo) => ({ id: wo.id, projectId: wo.project_id, code: wo.code, label: wo.label, description: wo.description })),
        })),
      )
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    IPC.PROJECT_CREATE,
    (_e, data: { name: string; clientName: string }): IpcResponse<Project> => {
      try {
        const id = randomUUID()
        getDb()
          .prepare(
            'INSERT INTO projects (id, name, client_name, active, created_at) VALUES (?, ?, ?, 1, ?)',
          )
          .run(id, data.name, data.clientName, new Date().toISOString())
        return ok({ id, name: data.name, clientName: data.clientName, active: true, workOrders: [] })
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(
    IPC.PROJECT_UPDATE,
    (_e, p: Pick<Project, 'id' | 'name' | 'clientName' | 'active'>): IpcResponse<void> => {
      try {
        getDb()
          .prepare('UPDATE projects SET name = ?, client_name = ?, active = ? WHERE id = ?')
          .run(p.name, p.clientName, p.active ? 1 : 0, p.id)
        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(
    IPC.WORKORDER_CREATE,
    (
      _e,
      data: { projectId: string; code: string; label: string; description: string },
    ): IpcResponse<WorkOrder> => {
      try {
        const id = randomUUID()
        getDb()
          .prepare(
            'INSERT INTO work_orders (id, project_id, code, label, description) VALUES (?, ?, ?, ?, ?)',
          )
          .run(id, data.projectId, data.code, data.label, data.description)
        return ok({ id, projectId: data.projectId, code: data.code, label: data.label, description: data.description })
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(IPC.WORKORDER_UPDATE, (_e, wo: WorkOrder): IpcResponse<void> => {
    try {
      getDb()
        .prepare('UPDATE work_orders SET code = ?, label = ?, description = ? WHERE id = ?')
        .run(wo.code, wo.label, wo.description, wo.id)
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.WORKORDER_DELETE, (_e, id: string): IpcResponse<void> => {
    try {
      const db = getDb()
      // Unassign any blocks referencing this work order
      db.prepare('UPDATE time_blocks SET work_order_id = NULL WHERE work_order_id = ?').run(id)
      db.prepare('DELETE FROM work_orders WHERE id = ?').run(id)
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })
}
