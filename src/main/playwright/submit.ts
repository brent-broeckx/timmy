// src/main/playwright/submit.ts
// Core submit engine: groups finalized time blocks by week, navigates to each
// week, fills the table using the hardcoded connector config, and waits for
// per-week user confirmation before saving.

import type { Page, Frame } from 'playwright'
import type { SubmitEntry, SubmitProgress, SubmitPrompt, SubmitResult } from '@shared/types'
import { getDb } from '../storage/db'
import { navigateToWeek, toYYYYWW, getWeekMonday, getWeekSunday, findFrameContaining } from './navigate'
import { assertNotLoginPage, getActivePage, launchSession } from './session'
import { TIME_REG_CONFIG } from './connectors/company-timeregistration'
import {
  CellNotInteractableError,
  PageStructureChangedError,
  SessionExpiredError,
} from './errors'

// ─── Cancellation token ───────────────────────────────────────────────────────

let _cancelled = false
let _confirmResolvers = new Map<string, (confirmed: boolean) => void>()
let _onProgress: ((p: SubmitProgress) => void) | null = null
let _result: SubmitResult | null = null

export function cancelSubmit(): void {
  _cancelled = true
  // Reject all pending confirmations
  for (const resolve of _confirmResolvers.values()) {
    resolve(false)
  }
  _confirmResolvers.clear()
}

export function confirmWeek(weekStart: string, confirmed: boolean): void {
  const resolve = _confirmResolvers.get(weekStart)
  if (resolve) {
    _confirmResolvers.delete(weekStart)
    resolve(confirmed)
  }
}

export function getSubmitResult(): SubmitResult | null {
  return _result
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

type RawBlock = {
  date: string
  decimal_hours: number
  title: string
  work_order_id: string
  project_id: string
}

/**
 * Load all finalized (non-deleted, completed) time blocks in [startDate, endDate].
 * Only blocks with a work order assigned are submittable.
 */
function loadSubmittableBlocks(startDate: string, endDate: string): RawBlock[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT date, decimal_hours, title, work_order_id, project_id
       FROM time_blocks
       WHERE date >= ? AND date <= ?
         AND deleted = 0
         AND end_time IS NOT NULL
         AND work_order_id IS NOT NULL
         AND decimal_hours IS NOT NULL
         AND decimal_hours > 0
       ORDER BY date, start_time`,
    )
    .all(startDate, endDate) as RawBlock[]
}

/** Look up the work order code for a given work_order_id. */
function getWorkOrderCode(workOrderId: string): string | null {
  const db = getDb()
  const row = db
    .prepare('SELECT code FROM work_orders WHERE id = ?')
    .get(workOrderId) as { code: string } | undefined
  return row?.code ?? null
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

type WeekGroup = {
  weekLabel: string    // YYYYWW
  weekStart: string   // ISO Monday
  weekEnd: string     // ISO Sunday
  entries: SubmitEntry[]
}

function groupByWeek(blocks: RawBlock[]): WeekGroup[] {
  // One SubmitEntry per block — no aggregation.
  const weekMap = new Map<string, WeekGroup>()

  for (const block of blocks) {
    const date = new Date(block.date + 'T00:00:00Z')
    const weekLabel = toYYYYWW(date)
    const workOrderCode = getWorkOrderCode(block.work_order_id)
    if (!workOrderCode) continue

    if (!weekMap.has(weekLabel)) {
      weekMap.set(weekLabel, {
        weekLabel,
        weekStart: getWeekMonday(date),
        weekEnd: getWeekSunday(date),
        entries: [],
      })
    }

    weekMap.get(weekLabel)!.entries.push({
      date: block.date,
      workOrderCode,
      workOrderId: block.work_order_id,
      projectId: block.project_id,
      decimalHours: Math.round(block.decimal_hours * 100) / 100,
      blockTitles: [block.title],
    })
  }

  return Array.from(weekMap.values()).sort((a, b) => a.weekLabel.localeCompare(b.weekLabel))
}

// ─── Column date formatting ───────────────────────────────────────────────────

function formatDateForColumn(day: number, month: number, year: number): string {
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const fmt = TIME_REG_CONFIG.columnDateFormat
  switch (fmt) {
    case 'D': return String(day)
    case 'DD': return dd
    case 'DD/MM': return `${dd}/${mm}`
    case 'DD-MM': return `${dd}-${mm}`
    case 'DD.MM': return `${dd}.${mm}`
    case 'DD/MM/YYYY': return `${dd}/${mm}/${year}`
    case 'MM/DD': return `${mm}/${dd}`
    case 'M/D': return `${String(month)}/${String(day)}`
    default: return String(day)
  }
}

// ─── Table interaction ────────────────────────────────────────────────────────

/**
 * Return the 1-based ISO day-of-week for an ISO date string (1=Mon … 7=Sun).
 * Used to map an entry date to the positional day input inside a row.
 */
function getDayOfWeek(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z')
  return ((d.getUTCDay() + 6) % 7) + 1
}

/**
 * Find the 0-based column index whose header matches the given ISO date,
 * formatted according to columnDateFormat in the connector config.
 * Returns -1 if no matching header is found.
 */
async function findColumnIndex(
  frame: Page | Frame,
  isoDate: string,
): Promise<number> {
  const date = new Date(isoDate + 'T00:00:00Z')
  const target = formatDateForColumn(
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCFullYear(),
  )

  const headers = frame.locator(TIME_REG_CONFIG.columnHeaderSelector)
  const count = await headers.count()

  for (let i = 0; i < count; i++) {
    const text = (await headers.nth(i).innerText({ timeout: 2_000 })).trim()
    if (text.includes(target)) return i
  }

  return -1
}

/**
 * Click the add-row button, wait for the new row to appear, fill the work
 * order code and the hours for the correct date column.
 *
 * One call per entry — one new row is added per call.
 */
async function addAndFillRow(
  frame: Page | Frame,
  entry: SubmitEntry,
  weekLabel: string,
): Promise<void> {
  const TIMEOUT = 10_000

  // Click the add-row button
  const addBtn = frame.locator(TIME_REG_CONFIG.addRowButtonSelector).first()
  await addBtn.waitFor({ state: 'attached', timeout: TIMEOUT })
  await addBtn.click({ force: true, timeout: TIMEOUT })
  await new Promise((r) => setTimeout(r, TIME_REG_CONFIG.timings.afterAddRow))

  // AGRESSO marks the newly added row with .EditRow — wait for it and use it directly
  const newRow = frame.locator(`${TIME_REG_CONFIG.rowSelector}.EditRow`).first()
  await newRow.waitFor({ state: 'attached', timeout: TIMEOUT })

  // Fill the work order code
  const woInput = newRow.locator(TIME_REG_CONFIG.workOrderInputSelector).first()
  await woInput.waitFor({ state: 'attached', timeout: TIMEOUT })
  await woInput.click({ force: true, timeout: TIMEOUT })
  await woInput.fill(entry.workOrderCode, { force: true, timeout: TIMEOUT })
  // Tab out — may trigger a server-side WO lookup / row re-render
  await woInput.press('Tab', { timeout: TIMEOUT })
  await new Promise((r) => setTimeout(r, TIME_REG_CONFIG.timings.afterWorkOrder))

  // Fill the description field: keep the server-pre-filled text and append
  // " / " + the time-block title(s) from our entry.
  const descSel = TIME_REG_CONFIG.descriptionInputSelector as string
  if (descSel) {
    const descInput = newRow.locator(descSel).first()
    if (await descInput.count() > 0) {
      const existing = (await descInput.inputValue({ timeout: TIMEOUT })).trim()
      const suffix = entry.blockTitles.join(' / ')
      const descValue = existing ? `${existing} / ${suffix}` : suffix
      await descInput.click({ force: true, timeout: TIMEOUT })
      await descInput.selectText({ timeout: TIMEOUT })
      await descInput.fill(descValue, { force: true, timeout: TIMEOUT })
      await descInput.press('Tab', { timeout: TIMEOUT })
    }
  }

  // Fill the hours into the correct day column.
  // Prefer the day-index template (fast, ID-based) over header scanning.
  const dayTemplate = TIME_REG_CONFIG.dayInputSelectorTemplate as string

  let cellInput: ReturnType<typeof newRow.locator>
  if (dayTemplate) {
    const dayIndex = getDayOfWeek(entry.date)
    cellInput = newRow.locator(dayTemplate.replace('{N}', String(dayIndex))).first()
  } else {
    const colIndex = await findColumnIndex(frame, entry.date)
    if (colIndex === -1) {
      throw new Error(
        `Date column for ${entry.date} not found in week ${weekLabel}. Entry skipped.`,
      )
    }
    const inputSel = TIME_REG_CONFIG.cellInputSelector as string
    const cell = newRow.locator('td').nth(colIndex)
    cellInput = inputSel === ':scope' ? cell : cell.locator(inputSel).first()
  }

  try {
    await cellInput.waitFor({ state: 'attached', timeout: TIMEOUT })
    await cellInput.click({ force: true, timeout: TIMEOUT })
    await cellInput.selectText({ timeout: TIMEOUT })
    await cellInput.fill(String(entry.decimalHours), { force: true, timeout: TIMEOUT })
    await cellInput.press('Tab', { timeout: TIMEOUT })
  } catch {
    // Retry once after a short pause
    await new Promise((r) => setTimeout(r, TIME_REG_CONFIG.timings.cellFillRetry))
    try {
      await cellInput.click({ force: true, timeout: TIMEOUT })
      await cellInput.selectText({ timeout: TIMEOUT })
      await cellInput.fill(String(entry.decimalHours), { force: true, timeout: TIMEOUT })
      await cellInput.press('Tab', { timeout: TIMEOUT })
    } catch {
      throw new CellNotInteractableError(entry.workOrderCode, entry.date)
    }
  }
}

// ─── Progress helpers ─────────────────────────────────────────────────────────

function emit(partial: Partial<SubmitProgress>, base: SubmitProgress): void {
  const updated = { ...base, ...partial }
  _onProgress?.(updated)
  Object.assign(base, updated)
}

// ─── Main submit entry point ──────────────────────────────────────────────────

export async function runSubmit(
  startDate: string,
  endDate: string,
  onProgress: (p: SubmitProgress) => void,
  onPrompt: (p: SubmitPrompt) => void,
): Promise<SubmitResult> {
  _cancelled = false
  _confirmResolvers.clear()
  _onProgress = onProgress
  _result = null

  const errors: string[] = []
  let weeksSubmitted = 0
  let entriesSubmitted = 0

  const progress: SubmitProgress = {
    currentWeek: '',
    weekLabel: '',
    status: 'idle',
    message: 'Loading entries…',
    progress: 0,
    weeksTotal: 0,
    weeksDone: 0,
  }

  emit({ status: 'idle', message: 'Loading entries…' }, progress)

  // 1. Load and group entries
  const blocks = loadSubmittableBlocks(startDate, endDate)
  const weeks = groupByWeek(blocks)

  if (weeks.length === 0) {
    _result = { success: true, weeksSubmitted: 0, entriesSubmitted: 0, errors: [] }
    emit({ status: 'complete', message: 'No entries to submit for the selected range.', progress: 100 }, progress)
    return _result
  }

  emit({ weeksTotal: weeks.length, message: `Found ${weeks.length} week(s) to submit.` }, progress)

  // 2. Get the active Playwright page, or launch a new session
  let page = getActivePage()
  if (!page) {
    const result = await launchSession(TIME_REG_CONFIG.url)
    page = result.page
  }

  try {
    await assertNotLoginPage(page)
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      emit({ status: 'error', message: e.message }, progress)
      _result = { success: false, weeksSubmitted, entriesSubmitted, errors: [e.message] }
      return _result
    }
  }

  // 3. Process each week
  for (let wi = 0; wi < weeks.length; wi++) {
    if (_cancelled) {
      emit({ status: 'cancelled', message: 'Submit cancelled.' }, progress)
      break
    }

    const week = weeks[wi]
    emit({
      currentWeek: week.weekStart,
      weekLabel: week.weekLabel,
      status: 'navigating',
      message: `Navigating to week ${week.weekLabel}…`,
      progress: Math.round((wi / weeks.length) * 80),
      weeksDone: wi,
    }, progress)

    // Navigate to the week
    try {
      await navigateToWeek(page, week.weekLabel)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(msg)
      emit({ status: 'error', message: msg }, progress)
      continue
    }

    // Check for session expiry after navigation
    try {
      await assertNotLoginPage(page)
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        emit({ status: 'error', message: e.message }, progress)
        _result = { success: false, weeksSubmitted, entriesSubmitted, errors: [e.message, ...errors] }
        return _result
      }
    }

    emit({ status: 'filling', message: `Filling ${week.entries.length} entries for week ${week.weekLabel}…` }, progress)

    // Resolve a fresh frame context after navigation using frame scan (works with <frame>/<frameset> too)
    const frame = await findFrameContaining(page, TIME_REG_CONFIG.periodInputSelector)

    // Fill each entry in the table
    for (const entry of week.entries) {
      if (_cancelled) break

      try {
        await addAndFillRow(frame, entry, week.weekLabel)
        entriesSubmitted++
      } catch (e) {
        if (e instanceof PageStructureChangedError) {
          emit({ status: 'error', message: e.message }, progress)
          _result = { success: false, weeksSubmitted, entriesSubmitted, errors: [e.message, ...errors] }
          return _result
        }
        if (e instanceof CellNotInteractableError) {
          errors.push(e.message)
          continue
        }
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`Error filling ${entry.workOrderCode} on ${entry.date}: ${msg}`)
      }
    }

    if (_cancelled) break

    // Pause for user confirmation
    emit({ status: 'awaiting-confirm', message: `Week ${week.weekLabel} is ready for review. Check the browser, then confirm.` }, progress)

    onPrompt({
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      weekLabel: week.weekLabel,
      entries: week.entries,
    })

    const confirmed = await new Promise<boolean>((resolve) => {
      _confirmResolvers.set(week.weekStart, resolve)
    })

    if (_cancelled) break

    if (confirmed) {
      emit({ status: 'submitting', message: `Submitting week ${week.weekLabel}…` }, progress)
      try {
        // Resolve a fresh frame context for the submit button
        const submitFrame = await findFrameContaining(page, TIME_REG_CONFIG.periodInputSelector)
        const submitBtn = submitFrame.locator(TIME_REG_CONFIG.submitButtonSelector).first()
        await submitBtn.waitFor({ state: 'attached', timeout: 10_000 })
        await submitBtn.click({ force: true, timeout: 10_000 })
        await page.waitForLoadState('networkidle', { timeout: 15_000 })
        weeksSubmitted++
      } catch (e) {
        const msg = `Failed to click submit button for week ${week.weekLabel}: ${e instanceof Error ? e.message : String(e)}`
        errors.push(msg)
      }
    } else {
      emit({ message: `Week ${week.weekLabel} skipped.` }, progress)
    }

    emit({ weeksDone: wi + 1, progress: Math.round(((wi + 1) / weeks.length) * 100) }, progress)
  }

  const finalStatus = _cancelled ? 'cancelled' : 'complete'
  const finalMsg = _cancelled
    ? 'Submit cancelled.'
    : `Done. ${weeksSubmitted} week(s) submitted, ${entriesSubmitted} entries filled.`

  emit({ status: finalStatus, message: finalMsg, progress: 100 }, progress)

  _result = {
    success: !_cancelled && errors.length === 0,
    weeksSubmitted,
    entriesSubmitted,
    errors,
  }
  return _result
}
