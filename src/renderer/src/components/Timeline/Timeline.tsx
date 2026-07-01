// src/renderer/src/components/Timeline/Timeline.tsx
// Ordered list of time blocks for the current day.
// Handles Ctrl+Z for undo and manages the soft-delete toast.

import { useEffect, useCallback, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useTaskStore } from '../../store/useTaskStore'
import { TimeBlock } from './TimeBlock'
import { SoftDeleteToast } from './SoftDeleteToast'

export function Timeline(): React.JSX.Element {
  const blocks = useTimelineStore((s) => s.blocks)
  const isLoading = useTimelineStore((s) => s.isLoading)
  const undo = useTimelineStore((s) => s.undo)
  const deleteBlock = useTimelineStore((s) => s.deleteBlock)
  const currentTask = useTaskStore((s) => s.currentTask)
  const clearCurrentTask = useTaskStore((s) => s.clearCurrentTask)

  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)

  // Called by TimeBlock when user triggers a delete
  const handleDeleteRequest = useCallback(
    (id: string, title: string): void => {
      deleteBlock(id)
      setPendingDelete({ id, title })
    },
    [deleteBlock],
  )

  const handleUndoDelete = (): void => {
    setPendingDelete(null)
    undo()
  }

  const handleConfirmDelete = (): void => {
    setPendingDelete(null)
  }

  // Global Ctrl+Z handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        undo().then(() => {
          // If the current task was removed by undo, clear the task store reference
          const updatedBlocks = useTimelineStore.getState().blocks
          if (currentTask && !updatedBlocks.find((b) => b.id === currentTask.id)) {
            clearCurrentTask()
          }
        })
      }
    },
    [undo, currentTask, clearCurrentTask],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading…
      </div>
    )
  }

  if (blocks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
        <p className="text-text-muted text-sm">No tasks yet today.</p>
        <p className="text-text-muted text-xs">
          Press{' '}
          <kbd className="border border-border rounded px-1 py-0.5">Ctrl+Shift+Space</kbd> to
          capture a task.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {blocks.map((block) => (
          <TimeBlock key={block.id} block={block} onDeleteRequest={handleDeleteRequest} />
        ))}
      </div>

      {pendingDelete && (
        <SoftDeleteToast
          message={`"${pendingDelete.title}" deleted`}
          onUndo={handleUndoDelete}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  )
}
