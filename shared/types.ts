// shared/types.ts
// Shared between Electron main process and React renderer.
// Import with @shared/types alias (configured in tsconfig + vite config).

// ─── IPC Channel Constants ─────────────────────────────────────────────────
export const IPC = {
  // Timeline
  TIMELINE_GET_DAY: 'timeline:getDay',
  TIMELINE_GET_RANGE: 'timeline:getRange',
  TIMELINE_ADD_BLOCK: 'timeline:addBlock',
  TIMELINE_UPDATE_BLOCK: 'timeline:updateBlock',
  TIMELINE_DELETE_BLOCK: 'timeline:deleteBlock',
  TIMELINE_RESTORE_BLOCK: 'timeline:restoreBlock',
  TIMELINE_START_DAY: 'timeline:startDay',
  TIMELINE_END_DAY: 'timeline:endDay',
  TIMELINE_GET_BOUNDARY: 'timeline:getBoundary',
  TIMELINE_CONTINUE_DAY: 'timeline:continueDay',
  // Tasks
  TASK_START: 'task:start',
  TASK_STOP: 'task:stop',
  TASK_GET_RECENT: 'task:getRecent',
  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  // Projects & work orders
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  WORKORDER_CREATE: 'workorder:create',
  WORKORDER_UPDATE: 'workorder:update',
  WORKORDER_DELETE: 'workorder:delete',
  // Window control (one-way, no response)
  WINDOW_SHOW_QUICK_CAPTURE: 'window:showQuickCapture',
  WINDOW_HIDE_QUICK_CAPTURE: 'window:hideQuickCapture',
  WINDOW_TOGGLE_OVERLAY: 'window:toggleOverlay',
  WINDOW_SHOW_OVERLAY: 'window:showOverlay',
  WINDOW_HIDE_OVERLAY: 'window:hideOverlay',
  WINDOW_MINIMIZE_OVERLAY: 'window:minimizeOverlay',
  WINDOW_HIDE_ANCHOR: 'window:hideAnchor',
  WINDOW_REPOSITION_ANCHOR: 'window:repositionAnchor',
  // Calendar connector
  CALENDAR_GET_STATUS: 'calendar:getStatus',
  CALENDAR_CONNECT: 'calendar:connect',
  CALENDAR_DISCONNECT: 'calendar:disconnect',
  CALENDAR_FETCH_EVENTS: 'calendar:fetchEvents',
  CALENDAR_GET_EVENTS: 'calendar:getEvents',
  CALENDAR_PULL_EVENT: 'calendar:pullEvent',
  // Push notifications (main → renderer, no response)
  STATE_TASK_CHANGED: 'state:taskChanged',
  STATE_PROJECTS_CHANGED: 'state:projectsChanged',
  STATE_OVERLAY_VISIBILITY: 'state:overlayVisibility',
  STATE_CALENDAR_UPDATED: 'state:calendarUpdated',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// ─── IPC Response Envelope ──────────────────────────────────────────────────
export type IpcResponse<T> = {
  data: T | null
  error: string | null
}

// ─── Domain Models ──────────────────────────────────────────────────────────
export type WorkOrder = {
  id: string
  projectId: string
  code: string // e.g. "WO-1001"
  label: string // e.g. "Development"
  description: string // plain-language, used for AI routing in Phase 5
}

export type Project = {
  id: string
  name: string
  clientName: string
  workOrders: WorkOrder[]
  active: boolean
}

export type TimeBlock = {
  id: string
  date: string // ISO date "YYYY-MM-DD"
  startTime: string // ISO datetime
  endTime: string | null // null if currently running
  title: string
  notes: string | null
  projectId: string | null
  workOrderId: string | null
  source: 'manual' | 'calendar' | 'git' | 'jira' | 'ado' | 'github'
  sourceId: string | null // external ID from source system
  durationMinutes: number | null
  decimalHours: number | null // Math.round(minutes / 60 * 100) / 100
  deleted: boolean
  createdAt: string
  updatedAt: string
}

export type TaskStartInput = {
  title: string
  projectId: string | null
  workOrderId: string | null
}

export type DayBoundary = {
  date: string
  startTime: string
  endTime: string | null
}

export type ConnectorConfig = {
  type: 'graph-calendar' | 'git' | 'github' | 'jira' | 'ado'
  enabled: boolean
  config: Record<string, string>
}

export type CalendarEvent = {
  id: string
  date: string
  startTime: string | null   // null = all-day event
  endTime: string | null
  title: string
  organizer: string | null
  isAllDay: boolean
  sourceId: string           // Graph event ID
  importedToTimeline: boolean
}

export type CalendarConnectorStatus = {
  connected: boolean
  email: string | null
  lastFetchedAt: string | null
}

export type SubmitFieldMap = {
  projectSelector: string
  workOrderSelector: string
  hoursSelector: string
  descriptionSelector: string
  addRowSelector: string
  submitSelector: string
}

export type AppConfig = {
  anchorPosition: 'TL' | 'TR' | 'BL' | 'BR'
  anchorMode: 'full' | 'dot-only' | 'hidden'
  anchorTrigger: 'click' | 'hover'
  quickCaptureShortcut: string
  theme: 'dark' | 'light'
  glassIntensity: number // 0–100
  undoStackDepth: number // default 20
  quickCaptureWorkOrderId: string | null
  connectors: ConnectorConfig[]
  submitFieldMap: SubmitFieldMap | null
}

// ─── Default config ──────────────────────────────────────────────────────────
export const DEFAULT_APP_CONFIG: AppConfig = {
  anchorPosition: 'BR',
  anchorMode: 'full',
  anchorTrigger: 'click',
  quickCaptureShortcut: 'CommandOrControl+Shift+Space',
  theme: 'dark',
  glassIntensity: 80,
  undoStackDepth: 20,
  quickCaptureWorkOrderId: null,
  connectors: [],
  submitFieldMap: null,
}

// ─── Utility ─────────────────────────────────────────────────────────────────
/** Compute decimal hours from minutes, rounded to 2 decimal places. */
export function toDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}

/** Format minutes as human-readable "Xh Ym" or "Ym". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Format elapsed milliseconds as "h:mm" for the anchor widget timer. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
