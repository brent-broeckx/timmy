// src/main/ipc/calendar.ts
// IPC handlers for Outlook calendar CSV import.
// All handlers return IpcResponse<T> — never throw to the renderer.

import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import type { CalendarEvent, CalendarImportResult, IpcResponse } from '@shared/types'
import {
    importOutlookCalendarCsv,
    getCalendarEventsForDate,
    pullCalendarEventToTimeline
} from '../connectors/outlook-csv-calendar'
import { getOverlayWindow } from '../windows'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(data: T): IpcResponse<T> {
  return { data, error: null }
}

function fail<T>(err: unknown): IpcResponse<T> {
  return { data: null, error: err instanceof Error ? err.message : String(err) }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerCalendarHandlers(): void {
  ipcMain.handle(
    IPC.CALENDAR_IMPORT_CSV,
    (_event, csvText: string): IpcResponse<CalendarImportResult> => {
      try {
        const result = importOutlookCalendarCsv(csvText)
        const today = new Date().toISOString().split('T')[0]
        getOverlayWindow()?.webContents.send(IPC.STATE_CALENDAR_UPDATED, today)
        return ok(result)
      } catch (e) {
        return fail(e)
      }
    }
  )

  ipcMain.handle(IPC.CALENDAR_GET_EVENTS, (_e, date: string): IpcResponse<CalendarEvent[]> => {
    try {
      return ok(getCalendarEventsForDate(date))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(IPC.CALENDAR_PULL_EVENT, (_e, eventId: string): IpcResponse<void> => {
    try {
      pullCalendarEventToTimeline(eventId)
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })
}
