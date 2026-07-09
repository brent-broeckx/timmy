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
 * Patch the Chromium Default/Preferences file to set exit_type = "Crashed"
 * before launching. Chromium normally clears session cookies after a clean
 * exit, which strips Entra ID auth cookies every time the window is closed.
 * Marking the exit as a crash causes Chromium to restore the full session on
 * the next launch, including session-only cookies, so the user stays logged in.
 *
 * Chromium overwrites this value with "Normal" on a clean shutdown, so we
 * patch it fresh before every launch.
 */
function patchProfileForSessionRestore(userDataDir: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { existsSync, readFileSync, writeFileSync } = require('fs') as typeof import('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('path') as typeof import('path')

  const prefsPath = pathJoin(userDataDir, 'Default', 'Preferences')
  if (!existsSync(prefsPath)) return // first run — nothing to restore yet

  try {
    const prefs = JSON.parse(readFileSync(prefsPath, 'utf-8')) as Record<string, unknown>
    if (!prefs.profile || typeof prefs.profile !== 'object') {
      prefs.profile = {}
    }
    const profile = prefs.profile as Record<string, unknown>
    profile.exit_type = 'Crashed'
    profile.exited_cleanly = false
    writeFileSync(prefsPath, JSON.stringify(prefs), 'utf-8')
  } catch {
    // If we can't read/write the file (permissions, corruption), proceed
    // without the patch — the user may just need to log in once more.
  }
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

  // Patch the Chromium profile so it restores session cookies on next launch.
  // Chromium clears session cookies on a clean exit, which means Entra ID auth
  // cookies are lost every time the browser window is closed. By marking the
  // previous exit as "Crashed" we tell Chromium to restore the full session
  // (including session-only cookies) when it starts again.
  patchProfileForSessionRestore(userDataDir)

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    // Give the window a recognizable title
    args: ['--window-size=1280,900'],
    // Do not record any traces or screenshots
    recordVideo: undefined,
  })

  _context = context

  // Clean up module state if the user closes the browser window externally.
  // Without this, _context stays as a stale reference and the next launchSession
  // call would try to reuse a dead context.
  context.on('close', () => {
    _context = null
    _page = null
  })

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
 * Wait until the current page navigates away from a Microsoft login URL.
 * Resolves once the user has completed login and been redirected back to the app.
 * Rejects (throws) if the timeout elapses before login completes.
 */
export async function waitForLoginCompletion(page: Page, timeoutMs = 300_000): Promise<void> {
  await page.waitForURL(
    (url) => !isLoginUrl(url.toString()),
    { timeout: timeoutMs },
  )
  // Let the app finish loading before the caller continues
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {
    // domcontentloaded may already be fired — ignore
  })
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
