// src/main/ipc/calendar.ts
// IPC handlers for the Microsoft Graph Calendar connector.
// All handlers return IpcResponse<T> — never throw to the renderer.

import { ipcMain } from 'electron'
import { getDb } from '../storage/db'
import { IPC } from '@shared/types'
import type { AppConfig, CalendarEvent, CalendarConnectorStatus, IpcResponse } from '@shared/types'
import {
    getCalendarStatus,
    connectCalendar,
    disconnectCalendar,
    fetchAndStoreCalendarEvents,
    getCalendarEventsForDate,
    pullCalendarEventToTimeline,
} from '../connectors/graph-calendar'
import { getOverlayWindow } from '../windows'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(data: T): IpcResponse<T> {
  return { data, error: null }
}

function fail<T>(err: unknown): IpcResponse<T> {
  return { data: null, error: err instanceof Error ? err.message : String(err) }
}

function getCalendarConnectorConfig(
  config: AppConfig,
): { clientId: string; tenantId: string } | null {
  // Env var baked in at build time takes priority over per-user settings
  const envClientId = import.meta.env.VITE_GRAPH_CLIENT_ID as string | undefined
  if (envClientId) {
    const envTenantId = (import.meta.env.VITE_GRAPH_TENANT_ID as string | undefined) ?? 'common'
    return { clientId: envClientId, tenantId: envTenantId }
  }
  const conn = config.connectors.find((c) => c.type === 'graph-calendar')
  const clientId = conn?.config?.clientId
  if (!clientId) return null
  return { clientId, tenantId: conn?.config?.tenantId ?? 'common' }
}

function readConfig(): AppConfig {
  // Import DEFAULT_APP_CONFIG inline to avoid circular deps
  const row = getDb()
    .prepare('SELECT value FROM config WHERE key = ?')
    .get('app') as { value: string } | undefined
  if (row) return JSON.parse(row.value) as AppConfig
  throw new Error('App config not found')
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerCalendarHandlers(): void {
  ipcMain.handle(IPC.CALENDAR_GET_STATUS, (): IpcResponse<CalendarConnectorStatus> => {
    try {
      return ok(getCalendarStatus())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    IPC.CALENDAR_CONNECT,
    async (): Promise<IpcResponse<CalendarConnectorStatus>> => {
      try {
        const config = readConfig()
        const creds = getCalendarConnectorConfig(config)
        if (!creds) {
          return fail('No Azure AD Client ID configured. Add it in Calendar Settings first.')
        }
        const status = await connectCalendar(creds.clientId, creds.tenantId)
        return ok(status)
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(IPC.CALENDAR_DISCONNECT, (): IpcResponse<void> => {
    try {
      disconnectCalendar()
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    IPC.CALENDAR_FETCH_EVENTS,
    async (_e, date: string): Promise<IpcResponse<{ imported: number; allDay: number; found: number }>> => {
      try {
        const config = readConfig()
        const creds = getCalendarConnectorConfig(config)
        if (!creds) return fail('Calendar connector not configured')
        const result = await fetchAndStoreCalendarEvents(date, creds.clientId, creds.tenantId)
        // Push update to all renderer windows
        getOverlayWindow()?.webContents.send(IPC.STATE_CALENDAR_UPDATED, date)
        return ok(result)
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(
    IPC.CALENDAR_GET_EVENTS,
    (_e, date: string): IpcResponse<CalendarEvent[]> => {
      try {
        return ok(getCalendarEventsForDate(date))
      } catch (e) {
        return fail(e)
      }
    },
  )

  ipcMain.handle(
    IPC.CALENDAR_PULL_EVENT,
    (_e, eventId: string): IpcResponse<void> => {
      try {
        pullCalendarEventToTimeline(eventId)
        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

// ─── Periodic refresh (called from main/index.ts) ─────────────────────────────

let _refreshTimer: ReturnType<typeof setInterval> | null = null

export function startCalendarRefreshTimer(
  getOverlayWin: () => Electron.BrowserWindow | null,
): void {
  if (_refreshTimer) return

  _refreshTimer = setInterval(async () => {
    const status = getCalendarStatus()
    if (!status.connected) return

    let config: AppConfig
    try {
      config = readConfig()
    } catch {
      return
    }

    const creds = getCalendarConnectorConfig(config)
    if (!creds) return

    const today = new Date().toISOString().split('T')[0]

    try {
      await fetchAndStoreCalendarEvents(today, creds.clientId, creds.tenantId)
      getOverlayWin()?.webContents.send(IPC.STATE_CALENDAR_UPDATED, today)
    } catch (err) {
      console.error('[calendar] periodic refresh failed:', err)
    }
  }, 5 * 60 * 1000) // every 5 minutes
}

export function stopCalendarRefreshTimer(): void {
  if (_refreshTimer) {
    clearInterval(_refreshTimer)
    _refreshTimer = null
  }
}
