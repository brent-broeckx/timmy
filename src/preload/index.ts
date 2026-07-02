// src/preload/index.ts
// Exposes a typed, channel-restricted `window.timmy` API to the renderer.
// NEVER expose ipcRenderer directly — always go through this whitelist.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'

const HANDLE_CHANNELS = new Set<string>([
  IPC.TIMELINE_GET_DAY,
  IPC.TIMELINE_GET_RANGE,
  IPC.TIMELINE_GET_BOUNDARY,
  IPC.TIMELINE_CONTINUE_DAY,
  IPC.TIMELINE_ADD_BLOCK,
  IPC.TIMELINE_UPDATE_BLOCK,
  IPC.TIMELINE_DELETE_BLOCK,
  IPC.TIMELINE_RESTORE_BLOCK,
  IPC.TIMELINE_START_DAY,
  IPC.TIMELINE_END_DAY,
  IPC.TASK_START,
  IPC.TASK_STOP,
  IPC.TASK_GET_RECENT,
  IPC.CONFIG_GET,
  IPC.CONFIG_SET,
  IPC.PROJECT_LIST,
  IPC.PROJECT_CREATE,
  IPC.PROJECT_UPDATE,
  IPC.PROJECT_DELETE,
  IPC.WORKORDER_CREATE,
  IPC.WORKORDER_UPDATE,
  IPC.WORKORDER_DELETE,
  // Calendar connector
  IPC.CALENDAR_GET_STATUS,
  IPC.CALENDAR_CONNECT,
  IPC.CALENDAR_DISCONNECT,
  IPC.CALENDAR_FETCH_EVENTS,
  IPC.CALENDAR_GET_EVENTS,
  IPC.CALENDAR_PULL_EVENT,
])

const SEND_CHANNELS = new Set<string>([
  IPC.WINDOW_SHOW_QUICK_CAPTURE,
  IPC.WINDOW_HIDE_QUICK_CAPTURE,
  IPC.WINDOW_TOGGLE_OVERLAY,
  IPC.WINDOW_SHOW_OVERLAY,
  IPC.WINDOW_HIDE_OVERLAY,
  IPC.WINDOW_MINIMIZE_OVERLAY,
  IPC.WINDOW_HIDE_ANCHOR,
  IPC.WINDOW_REPOSITION_ANCHOR,
])

const PUSH_CHANNELS = new Set<string>([
  IPC.STATE_TASK_CHANGED,
  IPC.STATE_PROJECTS_CHANGED,
  IPC.STATE_OVERLAY_VISIBILITY,
  IPC.STATE_CALENDAR_UPDATED,
])

const timmyApi = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> => {
    if (!HANDLE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel '${channel}' is not permitted`))
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<T>
  },
  send: (channel: string): void => {
    if (!SEND_CHANNELS.has(channel)) {
      throw new Error(`IPC send channel '${channel}' is not permitted`)
    }
    ipcRenderer.send(channel)
  },
  onPush: (channel: string, cb: (...args: unknown[]) => void): void => {
    if (!PUSH_CHANNELS.has(channel)) {
      throw new Error(`IPC push channel '${channel}' is not permitted`)
    }
    ipcRenderer.on(channel, cb as never)
  },
  offPush: (channel: string, cb: (...args: unknown[]) => void): void => {
    if (!PUSH_CHANNELS.has(channel)) {
      throw new Error(`IPC push channel '${channel}' is not permitted`)
    }
    ipcRenderer.off(channel, cb as never)
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('timmy', timmyApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (non-isolated context, only in legacy setups)
  window.timmy = timmyApi
}
