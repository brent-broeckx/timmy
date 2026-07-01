// src/renderer/src/store/__tests__/useTimelineStore.test.ts
// Tests for undo stack, block mutations, and the stack depth limit.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTimelineStore } from '../useTimelineStore'
import type { TimeBlock } from '@shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<TimeBlock> = {}): TimeBlock {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
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

// Mock the ipc module so store actions don't try to call window.timmy
vi.mock('../../ipc', () => ({
  ipc: {
    timeline: {
      getDay: vi.fn().mockResolvedValue([]),
      addBlock: vi.fn().mockImplementation((b: TimeBlock) => Promise.resolve(b)),
      updateBlock: vi.fn().mockImplementation((b: TimeBlock) => Promise.resolve(b)),
      deleteBlock: vi.fn().mockResolvedValue(undefined),
      restoreBlock: vi.fn().mockResolvedValue(undefined),
      startDay: vi.fn().mockResolvedValue({ date: '2026-07-01', startTime: new Date().toISOString(), endTime: null }),
      endDay: vi.fn().mockResolvedValue({ date: '2026-07-01', startTime: new Date().toISOString(), endTime: new Date().toISOString() }),
    },
  },
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useTimelineStore — undo stack', () => {
  beforeEach(() => {
    useTimelineStore.setState({
      blocks: [],
      dayBoundary: null,
      undoStack: [],
      undoDepth: 20,
      isLoading: false,
      selectedBlockId: null,
    })
  })

  it('addBlock pushes to undo stack and adds the block', async () => {
    const block = makeBlock({ title: 'Write tests' })
    await useTimelineStore.getState().addBlock(block)

    const state = useTimelineStore.getState()
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].title).toBe('Write tests')
    expect(state.undoStack).toHaveLength(1)
    expect(state.undoStack[0].blocks).toHaveLength(0) // snapshot before add
  })

  it('undo removes the added block', async () => {
    const block = makeBlock()
    await useTimelineStore.getState().addBlock(block)
    await useTimelineStore.getState().undo()

    const state = useTimelineStore.getState()
    expect(state.blocks).toHaveLength(0)
    expect(state.undoStack).toHaveLength(0)
  })

  it('undo does nothing when stack is empty', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await useTimelineStore.getState().undo()
    expect(useTimelineStore.getState().blocks).toHaveLength(0)
    consoleSpy.mockRestore()
  })

  it('undo stack is capped at undoDepth', async () => {
    useTimelineStore.setState({ undoDepth: 5 })

    for (let i = 0; i < 8; i++) {
      await useTimelineStore.getState().addBlock(makeBlock({ title: `Task ${i}` }))
    }

    const state = useTimelineStore.getState()
    expect(state.undoStack.length).toBeLessThanOrEqual(5)
  })

  it('updateBlock pushes to undo stack', async () => {
    const block = makeBlock({ title: 'Original' })
    await useTimelineStore.getState().addBlock(block)

    const updated = { ...block, title: 'Updated' }
    await useTimelineStore.getState().updateBlock(updated)

    const state = useTimelineStore.getState()
    expect(state.blocks[0].title).toBe('Updated')
    expect(state.undoStack).toHaveLength(2) // one for add, one for update
  })

  it('deleteBlock removes the block and pushes to undo stack', async () => {
    const block = makeBlock()
    await useTimelineStore.getState().addBlock(block)
    await useTimelineStore.getState().deleteBlock(block.id)

    const state = useTimelineStore.getState()
    expect(state.blocks).toHaveLength(0)
    expect(state.undoStack).toHaveLength(2)
  })

  it('blocks are sorted by startTime after addBlock', async () => {
    const t1 = makeBlock({ title: 'Second', startTime: '2026-07-01T10:00:00.000Z' })
    const t2 = makeBlock({ title: 'First', startTime: '2026-07-01T09:00:00.000Z' })
    await useTimelineStore.getState().addBlock(t1)
    await useTimelineStore.getState().addBlock(t2)

    const blocks = useTimelineStore.getState().blocks
    expect(blocks[0].title).toBe('First')
    expect(blocks[1].title).toBe('Second')
  })

  it('syncBlockLocal updates state without touching the undo stack', async () => {
    const block = makeBlock({ title: 'Running' })
    await useTimelineStore.getState().addBlock(block)
    const stackBefore = useTimelineStore.getState().undoStack.length

    const updated = { ...block, title: 'Running (updated)' }
    useTimelineStore.getState().syncBlockLocal(updated)

    const state = useTimelineStore.getState()
    expect(state.blocks[0].title).toBe('Running (updated)')
    expect(state.undoStack.length).toBe(stackBefore) // no new undo entry
  })
})
