// src/main/connectors/outlook-csv-calendar.ts
// Outlook calendar CSV import. Timmy stores Outlook eventId as sourceId so
// repeated imports update existing blocks instead of duplicating them.

import { randomUUID } from 'crypto'
import { getDb } from '../storage/db'
import type { CalendarEvent, CalendarImportResult } from '@shared/types'

type OutlookCsvRow = {
  eventTitle: string
  startTime: string
  endTime: string
  location: string
  isAllDay: string
  eventId: string
}

type ImportCounters = Omit<CalendarImportResult, 'errors'>

const REQUIRED_HEADERS = ['eventTitle', 'startTime', 'endTime', 'isAllDay', 'eventId'] as const

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        index++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index++
      row.push(field)
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
      field = ''
      continue
    }

    field += char
  }

  row.push(field)
  if (row.some((cell) => cell.length > 0)) rows.push(row)
  return rows
}

function normalizeHeader(header: string): string {
  return header.trim().replace(/^\uFEFF/, '')
}

function rowsFromCsv(text: string): OutlookCsvRow[] {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('CSV file is empty.')

  const headers = rows[0].map(normalizeHeader)
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`
    )
  }

  return rows.slice(1).map((values) => {
    const get = (header: string): string => values[headers.indexOf(header)]?.trim() ?? ''
    return {
      eventTitle: get('eventTitle'),
      startTime: get('startTime'),
      endTime: get('endTime'),
      location: get('location'),
      isAllDay: get('isAllDay'),
      eventId: get('eventId')
    }
  })
}

function parseBoolean(value: string): boolean {
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
}

function parseOutlookDateTime(value: string): string {
  const normalized = value.trim().replace(/\.(\d{3})\d+/, '.$1')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date/time: ${value}`)
  return date.toISOString()
}

function localDateFromOutlookDateTime(value: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  return parseOutlookDateTime(value).split('T')[0]
}

function rowToCalendarEvent(row: OutlookCsvRow): CalendarEvent {
  if (!row.eventId) throw new Error('Missing eventId')
  if (!row.eventTitle) throw new Error(`Missing eventTitle for eventId ${row.eventId}`)
  if (!row.startTime) throw new Error(`Missing startTime for eventId ${row.eventId}`)

  const isAllDay = parseBoolean(row.isAllDay)
  return {
    id: randomUUID(),
    date: localDateFromOutlookDateTime(row.startTime),
    startTime: isAllDay ? null : parseOutlookDateTime(row.startTime),
    endTime: isAllDay ? null : parseOutlookDateTime(row.endTime),
    title: row.eventTitle,
    organizer: row.location || null,
    isAllDay,
    sourceId: row.eventId,
    importedToTimeline: false
  }
}

function upsertCalendarEvent(event: CalendarEvent): boolean {
  const db = getDb()
  const existing = db
    .prepare(
      'SELECT id, imported_to_timeline FROM calendar_events WHERE source_id = ? AND date = ?'
    )
    .get(event.sourceId, event.date) as { id: string; imported_to_timeline: number } | undefined

  if (existing) {
    db.prepare(
      `UPDATE calendar_events SET
         start_time = ?, end_time = ?, title = ?, organizer = ?,
         is_all_day = ?
       WHERE id = ?`
    ).run(
      event.startTime,
      event.endTime,
      event.title,
      event.organizer,
      event.isAllDay ? 1 : 0,
      existing.id
    )
    event.id = existing.id
    event.importedToTimeline = existing.imported_to_timeline === 1
    return false
  }

  db.prepare(
    `INSERT INTO calendar_events
     (id, date, start_time, end_time, title, organizer, is_all_day, source_id, imported_to_timeline, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    event.id,
    event.date,
    event.startTime,
    event.endTime,
    event.title,
    event.organizer,
    event.isAllDay ? 1 : 0,
    event.sourceId,
    new Date().toISOString()
  )
  return true
}

function importTimedEventAsBlock(event: CalendarEvent): boolean {
  if (event.isAllDay || !event.startTime || !event.endTime) return false

  const db = getDb()
  const existing = db
    .prepare('SELECT id FROM time_blocks WHERE source_id = ? AND deleted = 0')
    .get(event.sourceId) as { id: string } | undefined

  const durationMs = new Date(event.endTime).getTime() - new Date(event.startTime).getTime()
  const durationMinutes = Math.round(durationMs / 60000)
  const decimalHours = Math.round((durationMinutes / 60) * 100) / 100

  if (existing) {
    db.prepare(
      `UPDATE time_blocks SET
         start_time = ?, end_time = ?, title = ?,
         duration_minutes = ?, decimal_hours = ?,
         updated_at = ?
       WHERE id = ?`
    ).run(
      event.startTime,
      event.endTime,
      event.title,
      durationMinutes,
      decimalHours,
      new Date().toISOString(),
      existing.id
    )
    return false
  }

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO time_blocks
     (id, date, start_time, end_time, title, notes, project_id, work_order_id,
      source, source_id, duration_minutes, decimal_hours, deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 'calendar', ?, ?, ?, 0, ?, ?)`
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
    now
  )

  db.prepare(
    'UPDATE calendar_events SET imported_to_timeline = 1 WHERE source_id = ? AND date = ?'
  ).run(event.sourceId, event.date)

  return true
}

export function importOutlookCalendarCsv(csvText: string): CalendarImportResult {
  const rows = rowsFromCsv(csvText)
  const errors: string[] = []
  const counters: ImportCounters = {
    imported: 0,
    updated: 0,
    skipped: 0,
    allDay: 0,
    found: rows.length
  }

  const events = rows.flatMap((row, index) => {
    try {
      return [rowToCalendarEvent(row)]
    } catch (err) {
      errors.push(`Row ${index + 2}: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }
  })

  const transaction = getDb().transaction((calendarEvents: CalendarEvent[]) => {
    for (const event of calendarEvents) {
      const calendarCreated = upsertCalendarEvent(event)
      if (event.isAllDay) {
        counters.allDay++
        continue
      }
      if (importTimedEventAsBlock(event)) {
        counters.imported++
      } else if (calendarCreated) {
        counters.skipped++
      } else {
        counters.updated++
      }
    }
  })

  transaction(events)
  return { ...counters, errors }
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
      'SELECT * FROM calendar_events WHERE date = ? ORDER BY is_all_day DESC, start_time ASC'
    )
    .all(date) as CalEvRow[]

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    organizer: row.organizer,
    isAllDay: row.is_all_day === 1,
    sourceId: row.source_id,
    importedToTimeline: row.imported_to_timeline === 1
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

  const row = getDb().prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId) as
    CalEvRow | undefined

  if (!row) throw new Error(`Calendar event ${eventId} not found`)
  if (row.is_all_day !== 1) throw new Error('Only all-day events need to be pulled manually')
  if (!row.start_time && !row.end_time) {
    const startTime = new Date(`${row.date}T09:00:00`).toISOString()
    const endTime = new Date(`${row.date}T10:00:00`).toISOString()
    const now = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO time_blocks
         (id, date, start_time, end_time, title, notes, project_id, work_order_id,
          source, source_id, duration_minutes, decimal_hours, deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 'calendar', ?, 60, 1.0, 0, ?, ?)`
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
      importedToTimeline: false
    })
  }

  getDb().prepare('UPDATE calendar_events SET imported_to_timeline = 1 WHERE id = ?').run(eventId)
}
