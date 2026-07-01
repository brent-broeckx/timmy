// src/main/windows.ts
// Shared window registry — avoids circular imports between index.ts and ipc/storage.ts.

import type { BrowserWindow } from 'electron'

let _overlay: BrowserWindow | null = null
let _quickCapture: BrowserWindow | null = null

export function setOverlayWindow(w: BrowserWindow): void {
  _overlay = w
}
export function setQuickCaptureWindow(w: BrowserWindow): void {
  _quickCapture = w
}
export function getOverlayWindow(): BrowserWindow | null {
  return _overlay
}
export function getQuickCaptureWindow(): BrowserWindow | null {
  return _quickCapture
}
