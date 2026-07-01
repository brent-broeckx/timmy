// src/renderer/src/store/useTimelineStore.ts
// Zustand store for the day timeline.
// All mutations push to the undo stack BEFORE applying.

import { create } from 'zustand'
import { ipc } from '../ipc'
import type { TimeBlock, DayBoundary } from '@shared/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

type TimelineSnapshot = {
  blocks: TimeBlock[]
  dayBoundary: DayBoundary | null
}

type TimelineState = {
  blocks: TimeBlock[]
  dayBoundary: DayBoundary | null
  undoStack: TimelineSnapshot[]
  undoDepth: number
  isLoading: boolean
  selectedBlockId: string | null
}

type TimelineActions = {
  /** Load blocks for a given date from the database. */
  loadDay: (date: string) => Promise<void>
  /** Add a new block (optimistic update + DB write + undo push). */
  addBlock: (block: TimeBlock) => Promise<void>
  /** Update an existing block (optimistic update + DB write + undo push). */
  updateBlock: (block: TimeBlock) => Promise<void>
  /** Soft-delete a block (optimistic update + DB write + undo push). */
  deleteBlock: (id: string) => Promise<void>
  /** Mark the start of the working day. */
  startDay: (date: string) => Promise<void>
  /** Mark the end of the working day. */
  endDay: (date: string) => Promise<void>
  /** Re-open a day that was accidentally ended — clears the endTime. */
  continueDay: (date: string) => Promise<void>
  /** Restore state to the previous snapshot and sync changes to DB. */
  undo: () => Promise<void>
  /** Sync a block to local state only — no DB call, no undo entry.
   *  Used when the DB was already updated via a different IPC call (e.g. task:stop). */
  syncBlockLocal: (block: TimeBlock) => void
  setSelectedBlock: (id: string | null) => void
  setUndoDepth: (depth: number) => void
}

export type TimelineStore = TimelineState & TimelineActions

// ─── Helpers ──────────────────────────────────────────────────────────────────

function snapshot(state: TimelineState): TimelineSnapshot {
  return {
    blocks: state.blocks.map((b) => ({ ...b })),
    dayBoundary: state.dayBoundary ? { ...state.dayBoundary } : null,
  }
}

function sortedInsert(blocks: TimeBlock[], block: TimeBlock): TimeBlock[] {
  return [...blocks, block].sort((a, b) => a.startTime.localeCompare(b.startTime))
}

/** Generate a new UUID using the Web Crypto API (available in Chromium renderer). */
function newId(): string {
  return globalThis.crypto.randomUUID()
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  blocks: [],
  dayBoundary: null,
  undoStack: [],
  undoDepth: 20,
  isLoading: false,
  selectedBlockId: null,

  loadDay: async (date) => {
    set({ isLoading: true })
    try {
      const [blocks, dayBoundary] = await Promise.all([
        ipc.timeline.getDay(date),
        ipc.timeline.getBoundary(date),
      ])
      set({ blocks, dayBoundary, isLoading: false })
    } catch (err) {
      console.error('[timeline] loadDay failed:', err)
      set({ isLoading: false })
    }
  },

  addBlock: async (block) => {
    const state = get()
    const snap = snapshot(state)
    const blockWithId: TimeBlock = block.id ? block : { ...block, id: newId() }

    set((s) => ({
      blocks: sortedInsert(s.blocks, blockWithId),
      undoStack: [...s.undoStack.slice(-(s.undoDepth - 1)), snap],
    }))

    try {
      await ipc.timeline.addBlock(blockWithId)
    } catch (err) {
      // Rollback
      set({ blocks: snap.blocks, undoStack: state.undoStack })
      console.error('[timeline] addBlock failed:', err)
    }
  },

  updateBlock: async (block) => {
    const state = get()
    const snap = snapshot(state)

    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === block.id ? block : b)),
      undoStack: [...s.undoStack.slice(-(s.undoDepth - 1)), snap],
    }))

    try {
      await ipc.timeline.updateBlock(block)
    } catch (err) {
      set({ blocks: snap.blocks, undoStack: state.undoStack })
      console.error('[timeline] updateBlock failed:', err)
    }
  },

  deleteBlock: async (id) => {
    const state = get()
    const snap = snapshot(state)

    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      undoStack: [...s.undoStack.slice(-(s.undoDepth - 1)), snap],
    }))

    try {
      await ipc.timeline.deleteBlock(id)
    } catch (err) {
      set({ blocks: snap.blocks, undoStack: state.undoStack })
      console.error('[timeline] deleteBlock failed:', err)
    }
  },

  startDay: async (date) => {
    const state = get()
    const snap = snapshot(state)
    const startTime = new Date().toISOString()
    const boundary: DayBoundary = { date, startTime, endTime: null }

    set((s) => ({
      dayBoundary: boundary,
      undoStack: [...s.undoStack.slice(-(s.undoDepth - 1)), snap],
    }))

    try {
      await ipc.timeline.startDay(date, startTime)
    } catch (err) {
      set({ dayBoundary: snap.dayBoundary, undoStack: state.undoStack })
      console.error('[timeline] startDay failed:', err)
    }
  },

  endDay: async (date) => {
    const state = get()
    const snap = snapshot(state)
    const endTime = new Date().toISOString()
    const updated = state.dayBoundary ? { ...state.dayBoundary, endTime } : null

    set((s) => ({
      dayBoundary: updated,
      undoStack: [...s.undoStack.slice(-(s.undoDepth - 1)), snap],
    }))

    try {
      await ipc.timeline.endDay(date, endTime)
    } catch (err) {
      set({ dayBoundary: snap.dayBoundary, undoStack: state.undoStack })
      console.error('[timeline] endDay failed:', err)
    }
  },

  continueDay: async (date) => {
    const state = get()
    const snap = snapshot(state)
    const updated = state.dayBoundary ? { ...state.dayBoundary, endTime: null } : null

    set((s) => ({
      dayBoundary: updated,
      undoStack: [...s.undoStack.slice(-(s.undoDepth - 1)), snap],
    }))

    try {
      await ipc.timeline.continueDay(date)
    } catch (err) {
      set({ dayBoundary: snap.dayBoundary, undoStack: state.undoStack })
      console.error('[timeline] continueDay failed:', err)
    }
  },

  undo: async () => {
    const state = get()
    if (state.undoStack.length === 0) return

    const prev = state.undoStack[state.undoStack.length - 1]
    const newStack = state.undoStack.slice(0, -1)
    const curr = state.blocks

    // Apply snapshot immediately (optimistic)
    set({ blocks: prev.blocks, dayBoundary: prev.dayBoundary, undoStack: newStack })

    // Sync diff to DB
    try {
      const toDelete = curr.filter((b) => !prev.blocks.find((p) => p.id === b.id))
      const toRestore = prev.blocks.filter((p) => !curr.find((c) => c.id === p.id))
      const toUpdate = prev.blocks.filter((p) => {
        const c = curr.find((c) => c.id === p.id)
        return c && JSON.stringify(c) !== JSON.stringify(p)
      })

      await Promise.all([
        ...toDelete.map((b) => ipc.timeline.deleteBlock(b.id)),
        ...toRestore.map((b) => ipc.timeline.restoreBlock(b.id)),
        ...toUpdate.map((b) => ipc.timeline.updateBlock(b)),
      ])
    } catch (err) {
      console.error('[timeline] undo DB sync failed:', err)
    }
  },

  syncBlockLocal: (block) => {
    set((s) => {
      // If the block is deleted, remove it from the local store (don't re-add it).
      // This handles the case where TASK_STOP is called on a deleted block and
      // STATE_TASK_CHANGED is pushed back — without this guard the block would
      // be re-inserted into the visible list.
      if (block.deleted) {
        return { blocks: s.blocks.filter((b) => b.id !== block.id) }
      }
      const exists = s.blocks.some((b) => b.id === block.id)
      return {
        blocks: exists
          ? s.blocks.map((b) => (b.id === block.id ? block : b))
          : sortedInsert(s.blocks, block),
      }
    })
  },

  setSelectedBlock: (id) => set({ selectedBlockId: id }),

  setUndoDepth: (depth) => set({ undoDepth: depth }),
}))
