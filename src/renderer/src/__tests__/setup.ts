// src/renderer/src/__tests__/setup.ts
// Vitest setup file for renderer (jsdom) tests.

import { vi, afterEach } from 'vitest'
import type { IpcResponse } from '@shared/types'

// Stub window.timmy so renderer code that calls ipc.* doesn't throw
const mockInvoke = vi.fn(
  <T>(_channel: string, ..._args: unknown[]): Promise<IpcResponse<T>> =>
    Promise.resolve({ data: null, error: null }),
)
const mockSend = vi.fn((_channel: string): void => undefined)

vi.stubGlobal('timmy', {
  invoke: mockInvoke,
  send: mockSend,
})

// Reset all mocks between tests
afterEach(() => {
  mockInvoke.mockClear()
  mockSend.mockClear()
})
