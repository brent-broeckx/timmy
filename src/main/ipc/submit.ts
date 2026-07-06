// src/main/ipc/submit.ts
// IPC handlers for the Playwright auto-submit feature.
// All handlers return IpcResponse<T>. Playwright runs exclusively here.

import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import type {
  SubmitEntry,
  SubmitProgress,
  SubmitPrompt,
  SubmitResult,
  IpcResponse,
} from '@shared/types'
import { getDb } from '../storage/db'
import {
  sessionDirectoryExists,
  clearSession,
} from '../playwright/session'
import {
  runSubmit,
  cancelSubmit,
  confirmWeek,
  getSubmitResult,
} from '../playwright/submit'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(data: T): IpcResponse<T> {
  return { data, error: null }
}

function fail<T>(err: unknown): IpcResponse<T> {
  return { data: null, error: err instanceof Error ? err.message : String(err) }
}

// Overlay window reference for push notifications
let _getOverlayWindow: (() => import('electron').BrowserWindow | null) | null = null

export function setOverlayWindowGetter(fn: () => import('electron').BrowserWindow | null): void {
  _getOverlayWindow = fn
}

function pushToRenderer<T>(channel: string, payload: T): void {
  _getOverlayWindow?.()?.webContents.send(channel, payload)
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerSubmitHandlers(): void {
  // ── Session ──────────────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.SUBMIT_CHECK_SESSION,
    (): IpcResponse<{ sessionExists: boolean }> => {
      try {
        return ok({ sessionExists: sessionDirectoryExists() })
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(IPC.SUBMIT_CLEAR_SESSION, async (): Promise<IpcResponse<void>> => {
    try {
      await clearSession()
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  // ── Submit entries ────────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.SUBMIT_GET_ENTRIES,
    (
      _e,
      startDate: string,
      endDate: string,
    ): IpcResponse<SubmitEntry[]> => {
      try {
        const db = getDb()
        const rows = db
          .prepare(
            `SELECT tb.date, tb.decimal_hours, tb.title, tb.work_order_id, tb.project_id,
                    wo.code AS work_order_code
             FROM time_blocks tb
             LEFT JOIN work_orders wo ON wo.id = tb.work_order_id
             WHERE tb.date >= ? AND tb.date <= ?
               AND tb.deleted = 0
               AND tb.end_time IS NOT NULL
               AND tb.work_order_id IS NOT NULL
               AND tb.decimal_hours IS NOT NULL
               AND tb.decimal_hours > 0
             ORDER BY tb.date, tb.start_time`,
          )
          .all(startDate, endDate) as Array<{
          date: string
          decimal_hours: number
          title: string
          work_order_id: string
          project_id: string
          work_order_code: string
        }>

        // Aggregate by date + work order
        const map = new Map<string, SubmitEntry>()
        for (const row of rows) {
          const key = `${row.date}::${row.work_order_id}`
          if (!map.has(key)) {
            map.set(key, {
              date: row.date,
              workOrderCode: row.work_order_code,
              workOrderId: row.work_order_id,
              projectId: row.project_id,
              decimalHours: 0,
              blockTitles: [],
            })
          }
          const entry = map.get(key)!
          entry.decimalHours = Math.round((entry.decimalHours + row.decimal_hours) * 100) / 100
          entry.blockTitles.push(row.title)
        }

        return ok(Array.from(map.values()))
      } catch (e) {
        return fail(e)
      }
    },
  )

  // submit:start is fire-and-forget from the renderer's perspective —
  // progress and prompts arrive via push channels.
  ipcMain.handle(
    IPC.SUBMIT_START,
    async (_e, startDate: string, endDate: string): Promise<IpcResponse<void>> => {
      try {
        // Fire and forget — do not await
        void runSubmit(
          startDate,
          endDate,
          (progress: SubmitProgress) => pushToRenderer(IPC.STATE_SUBMIT_PROGRESS, progress),
          (prompt: SubmitPrompt) => pushToRenderer(IPC.STATE_SUBMIT_PROMPT, prompt),
        )

        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(
    IPC.SUBMIT_GET_PROGRESS,
    (): IpcResponse<SubmitProgress> => {
      // The latest progress is pushed via STATE_SUBMIT_PROGRESS.
      // This handle returns a no-op — clients should listen to the push channel.
      return ok({
        currentWeek: '',
        weekLabel: '',
        status: 'idle',
        message: 'Use state:submitProgress push channel for live updates.',
        progress: 0,
        weeksTotal: 0,
        weeksDone: 0,
      })
    },
  )

  ipcMain.handle(
    IPC.SUBMIT_CONFIRM_WEEK,
    (_e, weekStart: string, confirmed: boolean): IpcResponse<void> => {
      try {
        confirmWeek(weekStart, confirmed)
        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(IPC.SUBMIT_CANCEL, (): IpcResponse<void> => {
    try {
      cancelSubmit()
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.SUBMIT_GET_RESULT, (): IpcResponse<SubmitResult | null> => {
    try {
      return ok(getSubmitResult())
    } catch (e) {
      return fail(e)
    }
  })
}
