// src/renderer/src/ipc/index.ts
// Single IPC boundary for the renderer process.
// All other renderer code imports from here — never calls window.timmy directly.

import { IPC } from '@shared/types'
import type { TimeBlock, DayBoundary, Project, WorkOrder, AppConfig, CalendarEvent, CalendarConnectorStatus, TaskStartInput, IpcResponse, SubmitEntry, SubmitProgress, SubmitPrompt, SubmitResult } from '@shared/types'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await window.timmy.invoke<T>(channel, ...args)
  if (response.error) throw new Error(response.error)
  return response.data as T
}

// ─── Push wrapper registry ──────────────────────────────────────────────────
// Electron IPC calls listeners with (IpcRendererEvent, ...payload).
// We strip the event and pass only the payload to typed callbacks.
// The wrapper reference must be stable so onPush/offPush are symmetric.
const _pushWrappers = new Map<unknown, (...args: unknown[]) => void>()

function registerPush<T>(cb: (arg: T) => void, channel: string): void {
  const wrapper = (...args: unknown[]): void => cb(args[1] as T)
  _pushWrappers.set(cb, wrapper)
  window.timmy.onPush(channel, wrapper)
}

function unregisterPush<T>(cb: (arg: T) => void, channel: string): void {
  const wrapper = _pushWrappers.get(cb)
  if (wrapper) {
    window.timmy.offPush(channel, wrapper)
    _pushWrappers.delete(cb)
  }
}

// ─── IPC client ─────────────────────────────────────────────────────────────

export const ipc = {
  timeline: {
    getDay: (date: string) => invoke<TimeBlock[]>(IPC.TIMELINE_GET_DAY, date),
    getRange: (from: string, to: string) => invoke<TimeBlock[]>(IPC.TIMELINE_GET_RANGE, from, to),
    getBoundary: (date: string) => invoke<DayBoundary | null>(IPC.TIMELINE_GET_BOUNDARY, date),
    continueDay: (date: string) => invoke<DayBoundary>(IPC.TIMELINE_CONTINUE_DAY, date),
    addBlock: (block: TimeBlock) => invoke<TimeBlock>(IPC.TIMELINE_ADD_BLOCK, block),
    updateBlock: (block: TimeBlock) => invoke<TimeBlock>(IPC.TIMELINE_UPDATE_BLOCK, block),
    deleteBlock: (id: string) => invoke<void>(IPC.TIMELINE_DELETE_BLOCK, id),
    restoreBlock: (id: string) => invoke<void>(IPC.TIMELINE_RESTORE_BLOCK, id),
    startDay: (date: string, startTime: string) =>
      invoke<DayBoundary>(IPC.TIMELINE_START_DAY, date, startTime),
    endDay: (date: string, endTime: string) =>
      invoke<DayBoundary>(IPC.TIMELINE_END_DAY, date, endTime),
  },
  task: {
    start: (input: TaskStartInput) => invoke<TimeBlock>(IPC.TASK_START, input),
    stop: (id: string) => invoke<TimeBlock>(IPC.TASK_STOP, id),
    getRecent: () => invoke<string[]>(IPC.TASK_GET_RECENT),
  },
  config: {
    get: () => invoke<AppConfig>(IPC.CONFIG_GET),
    set: (config: AppConfig) => invoke<void>(IPC.CONFIG_SET, config),
  },
  project: {
    list: () => invoke<Project[]>(IPC.PROJECT_LIST),
    create: (data: { name: string; clientName: string }) =>
      invoke<Project>(IPC.PROJECT_CREATE, data),
    update: (p: Pick<Project, 'id' | 'name' | 'clientName' | 'active'>) =>
      invoke<void>(IPC.PROJECT_UPDATE, p),
    delete: (id: string) => invoke<void>(IPC.PROJECT_DELETE, id),
  },
  workorder: {
    create: (data: { projectId: string; code: string; label: string; description: string }) =>
      invoke<WorkOrder>(IPC.WORKORDER_CREATE, data),
    update: (wo: WorkOrder) => invoke<void>(IPC.WORKORDER_UPDATE, wo),
    delete: (id: string) => invoke<void>(IPC.WORKORDER_DELETE, id),
  },
  calendar: {
    getStatus: () => invoke<CalendarConnectorStatus>(IPC.CALENDAR_GET_STATUS),
    connect: () => invoke<CalendarConnectorStatus>(IPC.CALENDAR_CONNECT),
    disconnect: () => invoke<void>(IPC.CALENDAR_DISCONNECT),
    fetchEvents: (date: string) => invoke<{ imported: number; allDay: number; found: number }>(IPC.CALENDAR_FETCH_EVENTS, date),
    getEvents: (date: string) => invoke<CalendarEvent[]>(IPC.CALENDAR_GET_EVENTS, date),
    pullEvent: (eventId: string) => invoke<void>(IPC.CALENDAR_PULL_EVENT, eventId),
  },
  window: {
    hideQuickCapture: () => window.timmy.send(IPC.WINDOW_HIDE_QUICK_CAPTURE),
    showQuickCapture: () => window.timmy.send(IPC.WINDOW_SHOW_QUICK_CAPTURE),
    toggleOverlay: () => window.timmy.send(IPC.WINDOW_TOGGLE_OVERLAY),
    showOverlay: () => window.timmy.send(IPC.WINDOW_SHOW_OVERLAY),
    hideOverlay: () => window.timmy.send(IPC.WINDOW_HIDE_OVERLAY),
    minimizeOverlay: () => window.timmy.send(IPC.WINDOW_MINIMIZE_OVERLAY),
    hideAnchor: () => window.timmy.send(IPC.WINDOW_HIDE_ANCHOR),
    repositionAnchor: () => window.timmy.send(IPC.WINDOW_REPOSITION_ANCHOR),
  },
  // Push: main → renderer with block payload
  onTaskChanged: (cb: (block: TimeBlock) => void): void => {
    registerPush(cb, IPC.STATE_TASK_CHANGED)
  },
  offTaskChanged: (cb: (block: TimeBlock) => void): void => {
    unregisterPush(cb, IPC.STATE_TASK_CHANGED)
  },
  onProjectsChanged: (cb: () => void): void => {
    registerPush(cb, IPC.STATE_PROJECTS_CHANGED)
  },
  offProjectsChanged: (cb: () => void): void => {
    unregisterPush(cb, IPC.STATE_PROJECTS_CHANGED)
  },
  onOverlayVisibility: (cb: (visible: boolean) => void): void => {
    registerPush(cb, IPC.STATE_OVERLAY_VISIBILITY)
  },
  offOverlayVisibility: (cb: (visible: boolean) => void): void => {
    unregisterPush(cb, IPC.STATE_OVERLAY_VISIBILITY)
  },
  // Push: calendar updated (date string)
  onCalendarUpdated: (cb: (date: string) => void): void => {
    registerPush(cb, IPC.STATE_CALENDAR_UPDATED)
  },
  offCalendarUpdated: (cb: (date: string) => void): void => {
    unregisterPush(cb, IPC.STATE_CALENDAR_UPDATED)
  },
  // ── Submit / Playwright automation ─────────────────────────────────────────
  submit: {
    checkSession: () => invoke<{ sessionExists: boolean }>(IPC.SUBMIT_CHECK_SESSION),
    clearSession: () => invoke<void>(IPC.SUBMIT_CLEAR_SESSION),
    getEntries: (startDate: string, endDate: string) =>
      invoke<SubmitEntry[]>(IPC.SUBMIT_GET_ENTRIES, startDate, endDate),
    start: (startDate: string, endDate: string) =>
      invoke<void>(IPC.SUBMIT_START, startDate, endDate),
    confirmWeek: (weekStart: string, confirmed: boolean) =>
      invoke<void>(IPC.SUBMIT_CONFIRM_WEEK, weekStart, confirmed),
    cancel: () => invoke<void>(IPC.SUBMIT_CANCEL),
    getResult: () => invoke<SubmitResult | null>(IPC.SUBMIT_GET_RESULT),
  },
  // Push: submit progress update
  onSubmitProgress: (cb: (p: SubmitProgress) => void): void => {
    registerPush(cb, IPC.STATE_SUBMIT_PROGRESS)
  },
  offSubmitProgress: (cb: (p: SubmitProgress) => void): void => {
    unregisterPush(cb, IPC.STATE_SUBMIT_PROGRESS)
  },
  // Push: per-week confirmation prompt
  onSubmitPrompt: (cb: (p: SubmitPrompt) => void): void => {
    registerPush(cb, IPC.STATE_SUBMIT_PROMPT)
  },
  offSubmitPrompt: (cb: (p: SubmitPrompt) => void): void => {
    unregisterPush(cb, IPC.STATE_SUBMIT_PROMPT)
  },
}

// Re-export response type so components don't need to import from @shared
export type { IpcResponse }
