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
import { setOverlayWindow, setQuickCaptureWindow } from './windows'
import { IPC, DEFAULT_APP_CONFIG } from '@shared/types'
import type { AppConfig } from '@shared/types'

let overlayWindow: BrowserWindow | null = null
let quickCaptureWindow: BrowserWindow | null = null
let tray: Tray | null = null

// ─── Config helpers ───────────────────────────────────────────────────────────

function readConfig(): AppConfig {
  try {
    const row = getDb()
      .prepare('SELECT value FROM config WHERE key = ?')
      .get('app') as { value: string } | undefined
    if (row) return JSON.parse(row.value) as AppConfig
  } catch {
    // fall through
  }
  return { ...DEFAULT_APP_CONFIG }
}

// ─── Window creation ──────────────────────────────────────────────────────────

function createOverlayWindow(): void {
  overlayWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 680,
    minHeight: 480,
    show: false,
    frame: false,
    transparent: false, // Glassmorphism added in Phase 2
    backgroundColor: '#0f0f1a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })
  setOverlayWindow(overlayWindow)

  overlayWindow.on('ready-to-show', () => overlayWindow?.show())

  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Hide to tray instead of quitting when user closes the window
  overlayWindow.on('close', (e) => {
    e.preventDefault()
    overlayWindow?.hide()
  })
}

function createQuickCaptureWindow(): void {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize

  quickCaptureWindow = new BrowserWindow({
    width: 640,
    height: 72,
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
  } else {
    overlayWindow?.show()
    overlayWindow?.focus()
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
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.timmy')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb()
  registerStorageHandlers()
  registerWindowHandlers()

  createOverlayWindow()
  createQuickCaptureWindow()
  setupTray()
  registerShortcuts()

  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
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
