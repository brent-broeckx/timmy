// src/main/playwright/navigate.ts
// Week navigation via the YYYYWW period input field.
// Uses the hardcoded connector config — no per-user setup required.
// After writing the period value, Playwright tabs out to trigger the table
// reload and waits using the configured tableReloadStrategy.

import type { Page, Frame } from 'playwright';
import { NavigationFailedError } from './errors';
import { TIME_REG_CONFIG } from './connectors/company-timeregistration';
import { getFrameContext } from './connectors/iframe';

// ─── ISO week calculation ─────────────────────────────────────────────────────

/**
 * Get ISO week year and week number for a given date.
 * ISO 8601: weeks start on Monday; week 1 contains the year's first Thursday.
 */
export function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Set to nearest Thursday (ISO week defined by Thursday)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

/** Format a date as "YYYYWW" — e.g. 2026-07-03 → "202627". */
export function toYYYYWW(date: Date): string {
  const { year, week } = getISOWeek(date)
  return `${year}${String(week).padStart(2, '0')}`
}

/**
 * Get the Monday (start) of the ISO week containing `date`.
 * Returns an ISO date string "YYYY-MM-DD".
 */
export function getWeekMonday(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7 // treat Sunday as 7
  d.setUTCDate(d.getUTCDate() - (day - 1))
  return d.toISOString().split('T')[0]
}

/**
 * Get the Sunday (end) of the ISO week containing `date`.
 * Returns an ISO date string "YYYY-MM-DD".
 */
export function getWeekSunday(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + (7 - day))
  return d.toISOString().split('T')[0]
}

/** Parse a YYYYWW string into { year, week }. */
export function parseYYYYWW(s: string): { year: number; week: number } {
  const year = parseInt(s.slice(0, 4), 10)
  const week = parseInt(s.slice(4, 6), 10)
  return { year, week }
}

/** Get the Monday of a given YYYYWW string as an ISO date string. */
export function weekMondayFromYYYYWW(s: string): string {
  const { year, week } = parseYYYYWW(s)
  // Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
  const monday = new Date(week1Monday)
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7)
  return monday.toISOString().split('T')[0]
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_TIMEOUT = 10_000 // 10 s per action
const NAV_RETRIES = 2

/**
 * Scan all frames currently attached to the page and return the first one
 * whose document contains an element matching `selector`.
 *
 * Uses page.frames() instead of FrameLocator so it works with both <iframe>
 * and <frame>/<frameset> page structures (common in older ASP.NET ERPs like
 * AGRESSO). Must be called after the page has settled (networkidle) so all
 * frames are attached.
 *
 * Falls back to the top-level Page if iframeChain is empty or no frame
 * contains the selector.
 */
export async function findFrameContaining(
  page: Page,
  selector: string,
): Promise<Frame | Page> {
  if (TIME_REG_CONFIG.iframeChain.length === 0) return page

  const frames = page.frames()
  console.log(
    '[APP] Scanning',
    frames.length,
    'frame(s):',
    frames.map((f) => f.url()),
  )

  for (const frame of frames) {
    if (frame === page.mainFrame()) continue
    try {
      const count = await frame.locator(selector).count()
      if (count > 0) {
        console.log('[APP] Found selector in frame:', frame.url())
        return frame
      }
    } catch {
      // Frame may have been detached between the frames() call and count() — skip
    }
  }

  console.log('[APP] Selector not found in any child frame — falling back to top-level page')
  return page
}

/**
 * Navigate to the given ISO week using the period input field from the connector
 * config. Tabs out to trigger the table reload, then waits based on the
 * configured tableReloadStrategy. Retries up to NAV_RETRIES times.
 *
 * Always resolves a fresh frame context — never reuse across reloads.
 */
export async function navigateToWeek(page: Page, weekLabel: string): Promise<void> {
  let lastError: Error | null = null

  // Wait for the page (and its iframes) to settle before attempting any
  // element interactions. Uses a generous timeout and swallows the error so
  // apps with continuous background requests don't block indefinitely.
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
    console.log('[APP] waitForLoadState(networkidle) timed out — proceeding anyway')
  })

  for (let attempt = 0; attempt < NAV_RETRIES; attempt++) {
    try {
      // Scan attached frames to find the one containing the period input.
      // Re-scans on each attempt in case the frame reloaded.
      const frameOrPage = await findFrameContaining(page, TIME_REG_CONFIG.periodInputSelector)

      console.log(`[APP] Navigating to week ${weekLabel} (attempt ${attempt + 1})`)
      const input = frameOrPage.locator(TIME_REG_CONFIG.periodInputSelector).first()

      console.log('[APP] Waiting for period input:', TIME_REG_CONFIG.periodInputSelector)
      await input.waitFor({ state: 'attached', timeout: NAV_TIMEOUT })

      console.log('[APP] Clicking period input')
      await input.click({ force: true, timeout: NAV_TIMEOUT })

      console.log(`[APP] Filling period input with ${weekLabel}`)
      await input.selectText({ timeout: NAV_TIMEOUT })
      await input.fill(weekLabel, { force: true, timeout: NAV_TIMEOUT })

      console.log('[APP] Tabbing out to trigger table reload')
      await input.press('Tab', { timeout: NAV_TIMEOUT })
      await new Promise((r) => setTimeout(r, TIME_REG_CONFIG.timings.afterPeriodInput))

      // Wait for the table to finish reloading based on the configured strategy.
      // Use .first() so a table with multiple <tbody> elements doesn't trigger
      // a strict-mode violation.
      const reloadLocator = frameOrPage.locator(TIME_REG_CONFIG.tableReloadSelector).first()
      if (TIME_REG_CONFIG.tableReloadStrategy === 'spinner-gone') {
        await reloadLocator.waitFor({ state: 'hidden', timeout: NAV_TIMEOUT })
      } else {
        await reloadLocator.waitFor({ state: 'attached', timeout: NAV_TIMEOUT })
      }

      return // success
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  throw new NavigationFailedError(weekLabel, lastError?.message)
}

/**
 * Read the column date headers from the current week table.
 * Returns an array of { index, text } where index is the 0-based column index.
 */
export async function readColumnHeaders(
  page: Page,
): Promise<Array<{ index: number; text: string }>> {
  const frame = getFrameContext(page)
  const headers = await frame.locator(TIME_REG_CONFIG.columnHeaderSelector).allInnerTexts()
  return headers.map((text, index) => ({ index, text: text.trim() }))
}
