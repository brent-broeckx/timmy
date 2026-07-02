// src/main/connectors/graph-calendar.ts
// Microsoft Graph Calendar connector.
// Handles OAuth via MSAL, encrypted token storage via Electron safeStorage,
// and calendar event fetching from the Graph API.
//
// OAuth flow: Authorization Code + PKCE via a local HTTP redirect server.
// Token persistence: MSAL cache serialized and encrypted with safeStorage, stored in SQLite.

import { PublicClientApplication } from '@azure/msal-node'
import type {
    Configuration,
    ICachePlugin,
    TokenCacheContext,
    AccountInfo,
} from '@azure/msal-node'
import { safeStorage, BrowserWindow } from 'electron'
import { createServer } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { randomBytes } from 'crypto'
import { randomUUID } from 'crypto'
import { URL } from 'url'
import { getDb } from '../storage/db'
import type { CalendarEvent, CalendarConnectorStatus } from '@shared/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const REDIRECT_PORT = 7891
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/auth/callback`
const SCOPES = ['Calendars.Read', 'User.Read', 'offline_access']
const CONNECTOR_KEY = 'graph-calendar'

// ─── Encryption helpers ───────────────────────────────────────────────────────

function encrypt(text: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64')
  }
  // Fallback: base64 only (not encrypted — warns in logs)
  console.warn('[calendar] safeStorage not available; tokens stored without OS encryption')
  return Buffer.from(text, 'utf-8').toString('base64')
}

function decrypt(data: string): string {
  const buf = Buffer.from(data, 'base64')
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf)
  }
  return buf.toString('utf-8')
}

// ─── Token persistence (SQLite) ───────────────────────────────────────────────

function loadTokenData(): string | null {
  try {
    const row = getDb()
      .prepare('SELECT token_data FROM connector_tokens WHERE connector = ?')
      .get(CONNECTOR_KEY) as { token_data: string } | undefined
    if (!row) return null
    return decrypt(row.token_data)
  } catch {
    return null
  }
}

function saveTokenData(serialized: string, email: string | null): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO connector_tokens
       (connector, token_data, account_email, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(CONNECTOR_KEY, encrypt(serialized), email, new Date().toISOString())
}

function deleteTokenData(): void {
  getDb().prepare('DELETE FROM connector_tokens WHERE connector = ?').run(CONNECTOR_KEY)
}

function getStoredEmail(): string | null {
  try {
    const row = getDb()
      .prepare('SELECT account_email FROM connector_tokens WHERE connector = ?')
      .get(CONNECTOR_KEY) as { account_email: string | null } | undefined
    return row?.account_email ?? null
  } catch {
    return null
  }
}

function hasStoredTokens(): boolean {
  try {
    const row = getDb()
      .prepare('SELECT 1 FROM connector_tokens WHERE connector = ?')
      .get(CONNECTOR_KEY)
    return row !== undefined
  } catch {
    return false
  }
}

// ─── MSAL instance management ─────────────────────────────────────────────────

let _pca: PublicClientApplication | null = null
let _currentClientId: string | null = null
let _currentTenantId: string | null = null
let _accountEmail: string | null = null
let _lastFetchedAt: string | null = null

function buildCachePlugin(): ICachePlugin {
  return {
    beforeCacheAccess: async (context: TokenCacheContext): Promise<void> => {
      const data = loadTokenData()
      if (data) context.tokenCache.deserialize(data)
    },
    afterCacheAccess: async (context: TokenCacheContext): Promise<void> => {
      if (context.cacheHasChanged) {
        saveTokenData(context.tokenCache.serialize(), _accountEmail)
      }
    },
  }
}

function getPca(clientId: string, tenantId: string): PublicClientApplication {
  if (_pca && _currentClientId === clientId && _currentTenantId === tenantId) {
    return _pca
  }

  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    cache: { cachePlugin: buildCachePlugin() },
  }

  _pca = new PublicClientApplication(config)
  _currentClientId = clientId
  _currentTenantId = tenantId
  return _pca
}

// ─── OAuth interactive flow ───────────────────────────────────────────────────

function interactiveAuth(
  pca: PublicClientApplication,
): Promise<CalendarConnectorStatus> {
  return new Promise((resolve, reject) => {
    const state = randomBytes(16).toString('hex')
    let authWindow: BrowserWindow | null = null
    let settled = false

    function settle(fn: () => void): void {
      if (settled) return
      settled = true
      fn()
    }

    const timeoutId = setTimeout(() => {
      server.close()
      authWindow?.destroy()
      settle(() => reject(new Error('Authentication timed out after 5 minutes')))
    }, 5 * 60 * 1000)

    const server = createServer((req: IncomingMessage, res: ServerResponse): void => {
      const u = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`)
      if (u.pathname !== '/auth/callback') {
        res.writeHead(404)
        res.end()
        return
      }

      const code = u.searchParams.get('code')
      const receivedState = u.searchParams.get('state')
      const error = u.searchParams.get('error')
      const errorDescription = u.searchParams.get('error_description')

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px">' +
        '<h2>Authentication complete</h2><p>You can close this window.</p></body></html>',
      )

      clearTimeout(timeoutId)
      server.close()
      setTimeout(() => authWindow?.destroy(), 500)

      if (error || !code || receivedState !== state) {
        settle(() =>
          reject(new Error(errorDescription ?? error ?? 'Authentication was cancelled')),
        )
        return
      }

      pca
        .acquireTokenByCode({
          code,
          redirectUri: REDIRECT_URI,
          scopes: SCOPES,
        })
        .then((result) => {
          _accountEmail = result?.account?.username ?? null
          settle(() =>
            resolve({
              connected: true,
              email: _accountEmail,
              lastFetchedAt: null,
            }),
          )
        })
        .catch((err: unknown) =>
          settle(() => reject(err instanceof Error ? err : new Error(String(err)))),
        )
    })

    server.on('error', (err: Error) => {
      clearTimeout(timeoutId)
      settle(() => reject(new Error(`Local redirect server error: ${err.message}`)))
    })

    server.listen(REDIRECT_PORT, async () => {
      try {
        const authUrl = await pca.getAuthCodeUrl({
          redirectUri: REDIRECT_URI,
          scopes: SCOPES,
          state,
          prompt: 'select_account'
        })

        authWindow = new BrowserWindow({
          width: 520,
          height: 720,
          show: true,
          title: 'Connect Microsoft Calendar',
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        })

        authWindow.loadURL(authUrl)

        authWindow.on('closed', () => {
          if (!settled) {
            clearTimeout(timeoutId)
            server.close()
            settle(() => reject(new Error('Authentication window was closed')))
          }
        })
      } catch (err: unknown) {
        clearTimeout(timeoutId)
        server.close()
        settle(() =>
          reject(err instanceof Error ? err : new Error('Failed to start OAuth flow')),
        )
      }
    })
  })
}

// ─── Token acquisition ────────────────────────────────────────────────────────

async function getAccessToken(pca: PublicClientApplication): Promise<string> {
  const accounts = await pca.getAllAccounts()
  if (accounts.length === 0) {
    throw new Error('Not authenticated. Please reconnect the calendar.')
  }

  let account: AccountInfo = accounts[0]

  try {
    const result = await pca.acquireTokenSilent({
      account,
      scopes: SCOPES,
    })
    if (result?.accessToken) {
      _accountEmail = result.account?.username ?? _accountEmail
      return result.accessToken
    }
  } catch {
    // Silent failed — token expired and refresh also failed
  }

  throw new Error('Token expired. Please reconnect the calendar.')
}

// ─── Graph API types ──────────────────────────────────────────────────────────

interface GraphEventDateTime {
  dateTime: string
  timeZone: string
}

interface GraphEvent {
  id: string
  subject: string
  start: GraphEventDateTime
  end: GraphEventDateTime
  organizer: { emailAddress: { name: string; address: string } } | null
  isAllDay: boolean
  isCancelled: boolean
}

interface GraphResponse {
  value: GraphEvent[]
  '@odata.nextLink'?: string
}

// ─── Event mapping ────────────────────────────────────────────────────────────

function graphEventToCalendarEvent(event: GraphEvent, date: string): CalendarEvent {
  let startTime: string | null = null
  let endTime: string | null = null

  if (!event.isAllDay) {
    // Graph returns times in UTC when Prefer: outlook.timezone="UTC" is honoured.
    // If the header was ignored (can happen for some account configs), timeZone will
    // be a Windows tz name. In that case, treat the value as local time (no suffix),
    // which Node.js parses as the system's local timezone — an acceptable approximation.
    const toISO = (dt: GraphEventDateTime): string => {
      if (dt.timeZone === 'UTC') return new Date(dt.dateTime + 'Z').toISOString()
      // Non-UTC: parse without suffix so Node interprets as local time
      return new Date(dt.dateTime).toISOString()
    }
    startTime = toISO(event.start)
    endTime = toISO(event.end)
  }

  return {
    id: randomUUID(),
    date,
    startTime,
    endTime,
    title: event.subject,
    organizer: event.organizer?.emailAddress.name ?? null,
    isAllDay: event.isAllDay,
    sourceId: event.id,
    importedToTimeline: false,
  }
}

// ─── Graph API fetch ──────────────────────────────────────────────────────────

async function fetchGraphEvents(
  date: string,
  token: string,
): Promise<CalendarEvent[]> {
  // Use the user's local day boundaries rather than UTC midnight.
  // new Date("YYYY-MM-DDT00:00:00") (no Z) is parsed as LOCAL time in Node.js,
  // so these give the correct UTC equivalent of the user's local midnight/end-of-day.
  const startDateTime = new Date(`${date}T00:00:00`).toISOString()
  const endDateTime = new Date(`${date}T23:59:59.999`).toISOString()

  // $orderby is not supported on calendarView for all account types — omit it.
  // calendarView already returns events sorted by start time.
  const url =
    `https://graph.microsoft.com/v1.0/me/calendarView` +
    `?startDateTime=${encodeURIComponent(startDateTime)}` +
    `&endDateTime=${encodeURIComponent(endDateTime)}` +
    `&$select=id,subject,start,end,organizer,isAllDay,isCancelled` +
    `&$top=100`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Prefer': 'outlook.timezone="UTC"',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Graph API error ${response.status}: ${text.slice(0, 400)}`)
  }

  const data = (await response.json()) as GraphResponse

  return data.value
    .filter((e) => !e.isCancelled)
    .map((e) => graphEventToCalendarEvent(e, date))
}

// ─── Calendar event DB helpers ────────────────────────────────────────────────

function upsertCalendarEvent(event: CalendarEvent): void {
  const db = getDb()
  const existing = db
    .prepare('SELECT id, imported_to_timeline FROM calendar_events WHERE source_id = ? AND date = ?')
    .get(event.sourceId, event.date) as
    | { id: string; imported_to_timeline: number }
    | undefined

  if (existing) {
    // Update time and title but preserve imported_to_timeline
    db.prepare(
      `UPDATE calendar_events SET
         start_time = ?, end_time = ?, title = ?, organizer = ?,
         is_all_day = ?
       WHERE id = ?`,
    ).run(
      event.startTime,
      event.endTime,
      event.title,
      event.organizer,
      event.isAllDay ? 1 : 0,
      existing.id,
    )
    event.id = existing.id
    event.importedToTimeline = existing.imported_to_timeline === 1
  } else {
    db.prepare(
      `INSERT INTO calendar_events
       (id, date, start_time, end_time, title, organizer, is_all_day, source_id, imported_to_timeline, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      event.id,
      event.date,
      event.startTime,
      event.endTime,
      event.title,
      event.organizer,
      event.isAllDay ? 1 : 0,
      event.sourceId,
      new Date().toISOString(),
    )
  }
}

function importTimedEventAsBlock(event: CalendarEvent): boolean {
  if (event.isAllDay || !event.startTime || !event.endTime) return false

  const db = getDb()

  // Check if a non-deleted block with this sourceId already exists
  const existing = db
    .prepare('SELECT id FROM time_blocks WHERE source_id = ? AND deleted = 0')
    .get(event.sourceId) as { id: string } | undefined

  if (existing) {
    // Update times and title in case the meeting was rescheduled
    const durationMs = new Date(event.endTime).getTime() - new Date(event.startTime).getTime()
    const durationMinutes = Math.round(durationMs / 60000)
    const decimalHours = Math.round((durationMinutes / 60) * 100) / 100

    db.prepare(
      `UPDATE time_blocks SET
         start_time = ?, end_time = ?, title = ?,
         duration_minutes = ?, decimal_hours = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      event.startTime,
      event.endTime,
      event.title,
      durationMinutes,
      decimalHours,
      new Date().toISOString(),
      existing.id,
    )
    return false // already existed
  }

  // Insert new block
  const durationMs = new Date(event.endTime).getTime() - new Date(event.startTime).getTime()
  const durationMinutes = Math.round(durationMs / 60000)
  const decimalHours = Math.round((durationMinutes / 60) * 100) / 100
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO time_blocks
     (id, date, start_time, end_time, title, notes, project_id, work_order_id,
      source, source_id, duration_minutes, decimal_hours, deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 'calendar', ?, ?, ?, 0, ?, ?)`,
  ).run(
    randomUUID(),
    event.date,
    event.startTime,
    event.endTime,
    event.title,
    event.sourceId,
    durationMinutes,
    decimalHours,
    now,
    now,
  )

  // Mark as imported in calendar_events
  db.prepare('UPDATE calendar_events SET imported_to_timeline = 1 WHERE source_id = ? AND date = ?')
    .run(event.sourceId, event.date)

  return true // newly created
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getCalendarStatus(): CalendarConnectorStatus {
  return {
    connected: hasStoredTokens(),
    email: getStoredEmail(),
    lastFetchedAt: _lastFetchedAt,
  }
}

export async function connectCalendar(
  clientId: string,
  tenantId: string,
): Promise<CalendarConnectorStatus> {
  const pca = getPca(clientId, tenantId)

  // Check if already authenticated and tokens are still valid
  const accounts = await pca.getAllAccounts()
  if (accounts.length > 0) {
    try {
      const result = await pca.acquireTokenSilent({
        account: accounts[0],
        scopes: SCOPES,
      })
      if (result?.accessToken) {
        _accountEmail = result.account?.username ?? null
        return { connected: true, email: _accountEmail, lastFetchedAt: _lastFetchedAt }
      }
    } catch {
      // Fall through to interactive
    }
  }

  return interactiveAuth(pca)
}

export function disconnectCalendar(): void {
  deleteTokenData()
  _pca = null
  _currentClientId = null
  _currentTenantId = null
  _accountEmail = null
  _lastFetchedAt = null
}

export async function fetchAndStoreCalendarEvents(
  date: string,
  clientId: string,
  tenantId: string,
): Promise<{ imported: number; allDay: number; found: number }> {
  const pca = getPca(clientId, tenantId)
  const token = await getAccessToken(pca)
  const events = await fetchGraphEvents(date, token)

  let imported = 0
  let allDay = 0
  for (const event of events) {
    upsertCalendarEvent(event)
    if (event.isAllDay) {
      allDay++
    } else {
      if (importTimedEventAsBlock(event)) imported++
    }
  }

  _lastFetchedAt = new Date().toISOString()
  return { imported, allDay, found: events.length }
}

export function getCalendarEventsForDate(date: string): CalendarEvent[] {
  type CalEvRow = {
    id: string
    date: string
    start_time: string | null
    end_time: string | null
    title: string
    organizer: string | null
    is_all_day: number
    source_id: string
    imported_to_timeline: number
  }

  const rows = getDb()
    .prepare(
      'SELECT * FROM calendar_events WHERE date = ? ORDER BY is_all_day DESC, start_time ASC',
    )
    .all(date) as CalEvRow[]

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    title: r.title,
    organizer: r.organizer,
    isAllDay: r.is_all_day === 1,
    sourceId: r.source_id,
    importedToTimeline: r.imported_to_timeline === 1,
  }))
}

export function pullCalendarEventToTimeline(eventId: string): void {
  type CalEvRow = {
    id: string
    date: string
    start_time: string | null
    end_time: string | null
    title: string
    organizer: string | null
    is_all_day: number
    source_id: string
    imported_to_timeline: number
  }

  const row = getDb()
    .prepare('SELECT * FROM calendar_events WHERE id = ?')
    .get(eventId) as CalEvRow | undefined

  if (!row) throw new Error(`Calendar event ${eventId} not found`)
  if (row.is_all_day !== 1) throw new Error('Only all-day events need to be pulled manually')
  if (!row.start_time && !row.end_time) {
    // All-day event: use noon as a single-hour placeholder
    const startTime = new Date(`${row.date}T09:00:00`).toISOString()
    const endTime = new Date(`${row.date}T10:00:00`).toISOString()
    const now = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO time_blocks
         (id, date, start_time, end_time, title, notes, project_id, work_order_id,
          source, source_id, duration_minutes, decimal_hours, deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 'calendar', ?, 60, 1.0, 0, ?, ?)`,
      )
      .run(randomUUID(), row.date, startTime, endTime, row.title, row.source_id, now, now)
  } else if (row.start_time && row.end_time) {
    importTimedEventAsBlock({
      id: row.id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      title: row.title,
      organizer: row.organizer,
      isAllDay: false,
      sourceId: row.source_id,
      importedToTimeline: false,
    })
  }

  // Mark imported
  getDb()
    .prepare('UPDATE calendar_events SET imported_to_timeline = 1 WHERE id = ?')
    .run(eventId)
}
