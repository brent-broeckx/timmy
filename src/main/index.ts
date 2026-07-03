import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Tray,
  nativeImage,
  globalShortcut,
  screen,
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDb, closeDb, getDb } from './storage/db'
import { registerStorageHandlers } from './ipc/storage'
import { registerCalendarHandlers, startCalendarRefreshTimer } from './ipc/calendar'
import { setOverlayWindow, setQuickCaptureWindow, setAnchorWindow } from './windows'
import { IPC, DEFAULT_APP_CONFIG } from '@shared/types'
import type { AppConfig } from '@shared/types'

let overlayWindow: BrowserWindow | null = null
let quickCaptureWindow: BrowserWindow | null = null
let anchorWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let tray: Tray | null = null
let overlayMoved = false

// ─── Config helpers ───────────────────────────────────────────────────────────

function readConfig(): AppConfig {
  try {
    const row = getDb()
      .prepare('SELECT value FROM config WHERE key = ?')
      .get('app') as { value: string } | undefined
    // Merge with defaults so newly-added config fields are always present
    if (row) return { ...DEFAULT_APP_CONFIG, ...(JSON.parse(row.value) as AppConfig) }
  } catch {
    // fall through
  }
  return { ...DEFAULT_APP_CONFIG }
}

// ─── Anchor position helpers ─────────────────────────────────────────────────

const ANCHOR_FULL_W = 220
const ANCHOR_FULL_H = 44
const ANCHOR_DOT_W = 44
const ANCHOR_DOT_H = 44
const ANCHOR_MARGIN = 12

function getAnchorBounds(
  corner: AppConfig['anchorPosition'],
  mode: AppConfig['anchorMode'],
): { x: number; y: number; width: number; height: number } {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const width = mode === 'dot-only' ? ANCHOR_DOT_W : ANCHOR_FULL_W
  const height = mode === 'dot-only' ? ANCHOR_DOT_H : ANCHOR_FULL_H
  let x: number
  let y: number
  switch (corner) {
    case 'TL': x = ANCHOR_MARGIN;                y = ANCHOR_MARGIN;               break
    case 'TR': x = sw - width - ANCHOR_MARGIN;   y = ANCHOR_MARGIN;               break
    case 'BL': x = ANCHOR_MARGIN;                y = sh - height - ANCHOR_MARGIN; break
    default:   x = sw - width - ANCHOR_MARGIN;   y = sh - height - ANCHOR_MARGIN; break
  }
  return { x, y, width, height }
}

function getOverlayPosition(corner: AppConfig['anchorPosition']): { x: number; y: number } {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const ow = 960
  const oh = 700
  const ab = getAnchorBounds(corner, 'full')
  switch (corner) {
    case 'TL': return { x: ab.x,                    y: ab.y + ab.height + 4 }
    case 'TR': return { x: ab.x + ab.width - ow,    y: ab.y + ab.height + 4 }
    case 'BL': return { x: ab.x,                    y: ab.y - oh - 4 }
    default:   return { x: Math.max(0, sw - ow - ANCHOR_MARGIN), y: Math.max(0, sh - oh - ANCHOR_MARGIN) }
  }
}

// ─── Window creation ──────────────────────────────────────────────────────────

function createOverlayWindow(): void {
  const config = readConfig()
  const { x, y } = getOverlayPosition(config.anchorPosition)

  overlayWindow = new BrowserWindow({
    width: 960,
    height: 700,
    x,
    y,
    minWidth: 680,
    minHeight: 480,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    },
    resizable: true
  })

  setOverlayWindow(overlayWindow)

  // Do NOT auto-show — the anchor window is the entry point.
  // The overlay shows only when the user clicks/hovers the anchor.

  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  overlayWindow.on('close', (e) => {
    e.preventDefault()
    overlayWindow?.hide()
    overlayWindow?.webContents.send(IPC.STATE_OVERLAY_VISIBILITY, false)
  })

  overlayWindow.on('moved', () => {
    overlayMoved = true
  })
}

function createAnchorWindow(): void {
  const config = readConfig()
  if (config.anchorMode === 'hidden') return

  const bounds = getAnchorBounds(config.anchorPosition, config.anchorMode)

  anchorWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  setAnchorWindow(anchorWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    anchorWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=anchor`)
  } else {
    anchorWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'anchor' }
    })
  }

  anchorWindow.on('ready-to-show', () => anchorWindow?.show())
}

function createSplashWindow(): void {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  splashWindow = new BrowserWindow({
    width: 440,
    height: 288,
    x: Math.round(sw / 2 - 220),
    y: Math.round(sh / 2 - 144),
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
    },
  })
  splashWindow.loadFile(join(__dirname, '../../resources/splash.html'))
  splashWindow.once('ready-to-show', () => splashWindow?.show())
}

function createQuickCaptureWindow(): void {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize

  quickCaptureWindow = new BrowserWindow({
    width: 640,
    height: 400,
    x: Math.round(width / 2 - 320),
    y: Math.round(height * 0.35),
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })
  setQuickCaptureWindow(quickCaptureWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    quickCaptureWindow.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}?window=quickcapture`,
    )
  } else {
    quickCaptureWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'quickcapture' },
    })
  }

  // Auto-hide when focus is lost
  quickCaptureWindow.on('blur', () => quickCaptureWindow?.hide())
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function setupTray(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Timmy — Time Tracker')
  tray.on('click', toggleOverlay)
}

function toggleOverlay(): void {
  if (overlayWindow?.isVisible()) {
    overlayWindow.hide()
    overlayWindow.webContents.send(IPC.STATE_OVERLAY_VISIBILITY, false)
  } else {
    if (!overlayMoved) {
      const config = readConfig()
      const { x, y } = getOverlayPosition(config.anchorPosition)
      overlayWindow?.setPosition(x, y)
    }
    overlayWindow?.show()
    overlayWindow?.focus()
    overlayWindow?.webContents.send(IPC.STATE_OVERLAY_VISIBILITY, true)
  }
}

// ─── Global shortcuts ─────────────────────────────────────────────────────────

function registerShortcuts(): void {
  const shortcut = readConfig().quickCaptureShortcut
  globalShortcut.register(shortcut, () => {
    if (quickCaptureWindow?.isVisible()) {
      quickCaptureWindow.hide()
    } else {
      quickCaptureWindow?.show()
      quickCaptureWindow?.focus()
    }
  })
}

// ─── Window IPC handlers ──────────────────────────────────────────────────────

function registerWindowHandlers(): void {
  ipcMain.on(IPC.WINDOW_HIDE_QUICK_CAPTURE, () => quickCaptureWindow?.hide())
  ipcMain.on(IPC.WINDOW_SHOW_QUICK_CAPTURE, () => {
    quickCaptureWindow?.show()
    quickCaptureWindow?.focus()
  })
  ipcMain.on(IPC.WINDOW_TOGGLE_OVERLAY, toggleOverlay)

  ipcMain.on(IPC.WINDOW_SHOW_OVERLAY, () => {
    if (!overlayWindow?.isVisible()) {
      if (!overlayMoved) {
        const config = readConfig()
        const { x, y } = getOverlayPosition(config.anchorPosition)
        overlayWindow?.setPosition(x, y)
      }
      overlayWindow?.show()
      overlayWindow?.focus()
      overlayWindow?.webContents.send(IPC.STATE_OVERLAY_VISIBILITY, true)
    }
  })

  ipcMain.on(IPC.WINDOW_HIDE_OVERLAY, () => {
    overlayWindow?.hide()
    overlayWindow?.webContents.send(IPC.STATE_OVERLAY_VISIBILITY, false)
  })

  ipcMain.on(IPC.WINDOW_MINIMIZE_OVERLAY, () => {
    overlayWindow?.minimize()
  })

  ipcMain.on(IPC.WINDOW_HIDE_ANCHOR, () => {
    anchorWindow?.hide()
  })

  ipcMain.on(IPC.WINDOW_REPOSITION_ANCHOR, () => {
    const config = readConfig()
    if (!anchorWindow) {
      createAnchorWindow()
      return
    }
    if (config.anchorMode === 'hidden') {
      anchorWindow.hide()
      return
    }
    const bounds = getAnchorBounds(config.anchorPosition, config.anchorMode)
    anchorWindow.setBounds(bounds)
    anchorWindow.show()
    // Anchor corner changed — reset overlay to default position relative to new corner
    overlayMoved = false
    if (overlayWindow?.isVisible()) {
      const { x, y } = getOverlayPosition(config.anchorPosition)
      overlayWindow.setPosition(x, y)
    }
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.timmy')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const splashStart = Date.now()
  createSplashWindow()

  initDb()
  registerStorageHandlers()
  registerCalendarHandlers()
  registerWindowHandlers()
  startCalendarRefreshTimer(() => overlayWindow)

  createOverlayWindow()
  createQuickCaptureWindow()
  createAnchorWindow()
  setupTray()
  registerShortcuts()

  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  // Close splash: requires both minimum display time AND main window loaded
  const MIN_DISPLAY_MS = 2700
  let timerDone = false
  let windowDone = false

  const tryCloseSplash = (): void => {
    if (!timerDone || !windowDone) return
    splashWindow?.close()
    splashWindow = null
  }

  setTimeout(() => {
    timerDone = true
    tryCloseSplash()
  }, Math.max(400, MIN_DISPLAY_MS - (Date.now() - splashStart)))

  if (overlayWindow) {
    overlayWindow.once('ready-to-show', () => {
      windowDone = true
      tryCloseSplash()
    })
  } else {
    windowDone = true
  }
})

// Stay alive in the tray; only quit explicitly
app.on('window-all-closed', () => {
  // Intentionally no app.quit() — app lives in the system tray
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  closeDb()
  tray?.destroy()
})
