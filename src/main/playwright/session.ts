// src/main/playwright/session.ts
// Manages a persistent Playwright browser context so the user only needs to
// log in once. Saves the session to <userData>/playwright-session.
//
// SECURITY: Never log, store, or transmit cookies, tokens, or any auth data.
// The persistent context directory is managed entirely by Playwright + the OS.

import { join } from 'path'
import type { BrowserContext, Page } from 'playwright'
import { SessionExpiredError } from './errors'

let _context: BrowserContext | null = null
let _page: Page | null = null

// Domains that indicate an Entra ID / Microsoft login redirect
const LOGIN_DOMAINS = [
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.windows.net',
  'sts.windows.net',
]

function isLoginUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return LOGIN_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

/** Return the path where the Playwright session profile is stored. */
export function getSessionDir(): string {
  // Lazy require keeps electron out of top-level scope for test compatibility
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'playwright-session')
}

/** True if a session directory already exists (not a guarantee it's still valid). */
export function sessionDirectoryExists(): boolean {
  const { existsSync } = require('fs') as typeof import('fs')
  return existsSync(getSessionDir())
}

/**
 * Launch (or reuse) the persistent browser context.
 * Returns { context, page }. The page is navigated to `targetUrl`.
 */
export async function launchSession(targetUrl: string): Promise<{ context: BrowserContext; page: Page }> {
  if (_context && _page && !_page.isClosed()) {
    await _page.bringToFront()
    return { context: _context, page: _page }
  }

  // Dynamic import — playwright is only needed in the main process
  const { chromium } = await import('playwright')

  const userDataDir = getSessionDir()

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    // Give the window a recognizable title
    args: ['--window-size=1280,900'],
    // Do not record any traces or screenshots
    recordVideo: undefined,
  })

  _context = context
  const pages = context.pages()
  const page = pages[0] ?? (await context.newPage())
  _page = page

  await page.goto(targetUrl, { timeout: 30_000 })

  return { context, page }
}

/**
 * Check whether the current page has been redirected to a Microsoft login page.
 * Throws SessionExpiredError if so.
 */
export async function assertNotLoginPage(page: Page): Promise<void> {
  const url = page.url()
  if (isLoginUrl(url)) {
    throw new SessionExpiredError()
  }
}

/**
 * Navigate to `targetUrl`, then verify we're not redirected to a login page.
 * Returns the page.
 */
export async function navigateTo(targetUrl: string): Promise<Page> {
  const { page } = await launchSession(targetUrl)
  // Wait for navigation to settle
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 })
  await assertNotLoginPage(page)
  return page
}

/**
 * Get the active page without launching a new session.
 * Returns null if no session is active.
 */
export function getActivePage(): Page | null {
  if (_page && !_page.isClosed()) return _page
  return null
}

/**
 * Close the persistent context (called on app quit or explicit clear).
 * Does NOT delete the session directory.
 */
export async function closeSession(): Promise<void> {
  try {
    await _context?.close()
  } catch {
    // ignore errors on close
  }
  _context = null
  _page = null
}

/**
 * Delete the session directory so the user must log in again.
 * Call only when the user explicitly requests it via Settings.
 */
export async function clearSession(): Promise<void> {
  await closeSession()
  const { rmSync, existsSync } = require('fs') as typeof import('fs')
  const dir = getSessionDir()
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}
