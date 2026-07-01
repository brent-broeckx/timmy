// src/renderer/src/store/__tests__/useTaskStore.test.ts
// Tests for task start/stop flow and recent tasks.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTaskStore } from '../useTaskStore'
import { useTimelineStore } from '../useTimelineStore'
import type { TimeBlock } from '@shared/types'

function makeBlock(overrides: Partial<TimeBlock> = {}): TimeBlock {
  const now = new Date().toISOString()
  return {
    id: 'test-block-id',
    date: '2026-07-01',
    startTime: now,
    endTime: null,
    title: 'Test task',
    notes: null,
    projectId: null,
    workOrderId: null,
    source: 'manual',
    sourceId: null,
    durationMinutes: null,
    decimalHours: null,
    deleted: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// vi.mock is hoisted — factory must not reference variables defined below
vi.mock('../../ipc', () => {
  const now = new Date().toISOString()
  const runningBlock: TimeBlock = {
    id: 'test-block-id',
    date: '2026-07-01',
    startTime: now,
    endTime: null,
    title: 'New task',
    notes: null,
    projectId: null,
    workOrderId: null,
    source: 'manual',
    sourceId: null,
    durationMinutes: null,
    decimalHours: null,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  }
  const stoppedBlock: TimeBlock = {
    ...runningBlock,
    endTime: now,
    durationMinutes: 30,
    decimalHours: 0.5,
  }

  return {
    ipc: {
      task: {
        start: vi.fn().mockResolvedValue(runningBlock),
        stop: vi.fn().mockResolvedValue(stoppedBlock),
        getRecent: vi.fn().mockResolvedValue(['Task A', 'Task B']),
      },
      timeline: {
        addBlock: vi.fn().mockImplementation((b: TimeBlock) => Promise.resolve(b)),
        updateBlock: vi.fn().mockImplementation((b: TimeBlock) => Promise.resolve(b)),
        deleteBlock: vi.fn().mockResolvedValue(undefined),
        restoreBlock: vi.fn().mockResolvedValue(undefined),
        getDay: vi.fn().mockResolvedValue([]),
        startDay: vi.fn().mockResolvedValue({}),
        endDay: vi.fn().mockResolvedValue({}),
      },
    },
  }
})

describe('useTaskStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTaskStore.setState({ currentTask: null, recentTasks: [] })
    useTimelineStore.setState({
      blocks: [],
      dayBoundary: null,
      undoStack: [],
      undoDepth: 20,
      isLoading: false,
      selectedBlockId: null,
    })
  })

  it('startTask sets currentTask and adds block to timeline', async () => {
    await useTaskStore.getState().startTask('New task')

    expect(useTaskStore.getState().currentTask?.title).toBe('New task')
    expect(useTimelineStore.getState().blocks).toHaveLength(1)
  })

  it('stopTask clears currentTask and updates the timeline block', async () => {
    // Set up a running task
    const block = makeBlock({ id: 'test-block-id', title: 'New task' })
    useTaskStore.setState({ currentTask: block })
    useTimelineStore.setState({ blocks: [block] })

    await useTaskStore.getState().stopTask()

    expect(useTaskStore.getState().currentTask).toBeNull()
    const stoppedBlock = useTimelineStore.getState().blocks[0]
    expect(stoppedBlock.endTime).not.toBeNull()
  })

  it('stopTask does nothing when no task is running', async () => {
    const { stop } = await import('../../ipc').then((m) => m.ipc.task)
    await useTaskStore.getState().stopTask()
    expect(stop).not.toHaveBeenCalled()
  })

  it('loadRecent populates recentTasks', async () => {
    await useTaskStore.getState().loadRecent()
    expect(useTaskStore.getState().recentTasks).toEqual(['Task A', 'Task B'])
  })

  it('clearCurrentTask sets currentTask to null immediately', () => {
    useTaskStore.setState({ currentTask: makeBlock() })
    useTaskStore.getState().clearCurrentTask()
    expect(useTaskStore.getState().currentTask).toBeNull()
  })
})
