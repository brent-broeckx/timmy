import type { IpcResponse } from '@shared/types'

declare global {
  interface Window {
    timmy: {
      invoke: <T>(channel: string, ...args: unknown[]) => Promise<IpcResponse<T>>
      send: (channel: string) => void
      onPush: (channel: string, cb: (...args: unknown[]) => void) => void
      offPush: (channel: string, cb: (...args: unknown[]) => void) => void
    }
  }
}
