// src/main/playwright/connectors/iframe.ts
// Resolves the correct Playwright frame context based on the iframeChain config.
// Every selector lookup must go through this helper — never query page directly
// for elements that live inside an iframe.

import type { Page, FrameLocator } from 'playwright'
import { TIME_REG_CONFIG } from './company-timeregistration'

/**
 * Resolves the correct frame context based on the configured iframeChain.
 *
 * - If iframeChain is empty: returns the page itself (no iframes).
 * - If iframeChain has one entry: returns page.frameLocator(chain[0]).
 * - If iframeChain has multiple entries: chains frameLocator calls from outermost
 *   to innermost and returns the innermost FrameLocator.
 *
 * IMPORTANT: Call this fresh before every action sequence. Do NOT cache the
 * result across page or iframe reloads — frame locators do not survive reloads.
 */
export function getFrameContext(page: Page): Page | FrameLocator {
  const chain = TIME_REG_CONFIG.iframeChain

  if (chain.length === 0) {
    // No iframes — work directly on the top-level page
    return page
  }

  let frame: FrameLocator = page.frameLocator(chain[0])
  console.log('[APP] Resolved frame context for iframe chain:', chain)

  if (!frame) {
    for (let i = 1; i < chain.length; i++) {
        frame = frame.frameLocator(chain[i])
    }
  }

  
  return frame
}
