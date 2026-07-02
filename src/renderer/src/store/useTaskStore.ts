// src/renderer/src/store/useTaskStore.ts
// Manages the currently running task and recent task titles.

import { create } from 'zustand'
import { ipc } from '../ipc'
import { useTimelineStore } from './useTimelineStore'
import type { TaskStartInput, TimeBlock } from '@shared/types'

type TaskState = {
  currentTask: TimeBlock | null
  recentTasks: string[]
}

type TaskActions = {
  /** Start a new task. If a task is running, stop it first. */
  startTask: (title: string, assignment?: Pick<TaskStartInput, 'projectId' | 'workOrderId'>) => Promise<void>
  /** Stop the currently running task. Pass the block id when stopping from the overlay (task store currentTask may be null in that window). */
  stopTask: (id?: string) => Promise<void>
  /** Clear the current task reference without any DB/IPC call. */
  clearCurrentTask: () => void
  /** Load the 20 most-recently used task titles. */
  loadRecent: () => Promise<void>
}

export const useTaskStore = create<TaskState & TaskActions>((set, get) => ({
  currentTask: null,
  recentTasks: [],

  startTask: async (title, assignment) => {
    const runningTask = get().currentTask
      ?? useTimelineStore.getState().blocks.find((block) => block.endTime === null)
      ?? null

    // Stop the running task first (silent — no undo push, just sync local state)
    if (runningTask) {
      try {
        const stopped = await ipc.task.stop(runningTask.id)
        useTimelineStore.getState().syncBlockLocal(stopped)
      } catch (err) {
        console.error('[task] failed to stop previous task:', err)
      }
    }

    try {
      // task:start creates the block in DB and updates recent_tasks
      const block = await ipc.task.start({
        title,
        projectId: assignment?.projectId ?? null,
        workOrderId: assignment?.workOrderId ?? null,
      })
      set({ currentTask: block })
      // addBlock pushes an undo entry and does INSERT OR IGNORE (no-op since DB already has it)
      await useTimelineStore.getState().addBlock(block)
    } catch (err) {
      set({ currentTask: null })
      console.error('[task] startTask failed:', err)
    }
  },

  stopTask: async (id?: string) => {
    const runningTask = get().currentTask
      ?? useTimelineStore.getState().blocks.find((block) => block.endTime === null)
      ?? null
    const targetId = id ?? runningTask?.id
    if (!targetId) return

    try {
      const stopped = await ipc.task.stop(targetId)
      set({ currentTask: null })
      // updateBlock pushes an undo entry and syncs to DB (idempotent)
      await useTimelineStore.getState().updateBlock(stopped)
    } catch (err) {
      console.error('[task] stopTask failed:', err)
    }
  },

  clearCurrentTask: () => set({ currentTask: null }),

  loadRecent: async () => {
    try {
      const titles = await ipc.task.getRecent()
      set({ recentTasks: titles })
    } catch (err) {
      console.error('[task] loadRecent failed:', err)
    }
  },
}))
