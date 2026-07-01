// src/renderer/src/components/Anchor/AnchorWidget.tsx
// Small persistent header element showing the running task and elapsed time.

import { useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useTaskStore } from '../../store/useTaskStore'
import { formatElapsed } from '@shared/types'

type Props = {
  onOpenSettings: () => void
}

export function AnchorWidget({ onOpenSettings }: Props): React.JSX.Element {
  // Derive running task directly from the timeline store — works across both windows
  const runningBlock = useTimelineStore((s) => s.blocks.find((b) => b.endTime === null) ?? null)
  const stopTask = useTaskStore((s) => s.stopTask)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Tick the elapsed-time counter off wall-clock delta, not an accumulator
  useEffect(() => {
    if (!runningBlock) {
      setElapsed(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    const startMs = new Date(runningBlock.startTime).getTime()
    const tick = (): void => setElapsed(Date.now() - startMs)
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [runningBlock?.id, runningBlock?.startTime])

  const handleStop = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (runningBlock) stopTask(runningBlock.id)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border select-none">
      {/* Running indicator */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {runningBlock ? (
          <>
            <span className="w-2 h-2 rounded-full bg-accent ring-pulse flex-shrink-0" />
            <span className="text-sm text-text-primary truncate max-w-[200px]" title={runningBlock.title}>
              {runningBlock.title}
            </span>
            <span className="text-sm text-text-muted font-mono tabular-nums flex-shrink-0">
              {formatElapsed(elapsed)}
            </span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-text-muted flex-shrink-0" />
            <span className="text-sm text-text-muted">No task running</span>
          </>
        )}
      </div>

      {/* Stop button */}
      {runningBlock && (
        <button
          onClick={handleStop}
          className="w-6 h-6 flex items-center justify-center rounded bg-red-600 hover:bg-red-500 text-white text-xs flex-shrink-0 transition-colors"
          aria-label="Stop task"
          title="Stop task"
        >
          ■
        </button>
      )}

      {/* Settings shortcut */}
      <button
        onClick={onOpenSettings}
        className="text-text-muted hover:text-text-primary transition-colors text-base leading-none px-1"
        aria-label="Open settings"
        title="Settings"
      >
        ⚙
      </button>
    </div>
  )
}
