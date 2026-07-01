// src/renderer/src/ipc/index.ts
// Single IPC boundary for the renderer process.
// All other renderer code imports from here — never calls window.timmy directly.

import { IPC } from '@shared/types'
import type { TimeBlock, DayBoundary, Project, WorkOrder, AppConfig, IpcResponse } from '@shared/types'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await window.timmy.invoke<T>(channel, ...args)
  if (response.error) throw new Error(response.error)
  // The IpcResponse<void> case: data is undefined/null but no error = success
  return response.data as T
}

export const ipc = {
  timeline: {
    getDay: (date: string) => invoke<TimeBlock[]>(IPC.TIMELINE_GET_DAY, date),
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
    start: (title: string) => invoke<TimeBlock>(IPC.TASK_START, title),
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
  },
  workorder: {
    create: (data: { projectId: string; code: string; label: string; description: string }) =>
      invoke<WorkOrder>(IPC.WORKORDER_CREATE, data),
    update: (wo: WorkOrder) => invoke<void>(IPC.WORKORDER_UPDATE, wo),
    delete: (id: string) => invoke<void>(IPC.WORKORDER_DELETE, id),
  },
  window: {
    hideQuickCapture: () => window.timmy.send(IPC.WINDOW_HIDE_QUICK_CAPTURE),
    showQuickCapture: () => window.timmy.send(IPC.WINDOW_SHOW_QUICK_CAPTURE),
    toggleOverlay: () => window.timmy.send(IPC.WINDOW_TOGGLE_OVERLAY),
  },
  onTaskChanged: (cb: () => void): void => {
    window.timmy.onPush(IPC.STATE_TASK_CHANGED, cb)
  },
  offTaskChanged: (cb: () => void): void => {
    window.timmy.offPush(IPC.STATE_TASK_CHANGED, cb)
  },
}

// Re-export response type so components don't need to import from @shared
export type { IpcResponse }
