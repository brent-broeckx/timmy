// src/renderer/src/components/Anchor/AnchorWidget.tsx
// Small persistent header element showing the running task and elapsed time.

import { useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useTaskStore } from '../../store/useTaskStore'
import { useConfigStore } from '../../store/useConfigStore'
import { formatElapsed } from '@shared/types'
import { Settings2 } from 'lucide-react'

type Props = {
  onOpenSettings: () => void
}

export function AnchorWidget({ onOpenSettings }: Props): React.JSX.Element {
  // Derive running task directly from the timeline store — works across both windows
  const runningBlock = useTimelineStore((s) => s.blocks.find((b) => b.endTime === null) ?? null)
  const stopTask = useTaskStore((s) => s.stopTask)
  const glassIntensity = useConfigStore((s) => s.config.glassIntensity)
  const bgOpacity = 1 - (glassIntensity / 100) * 0.8
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
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b border-border select-none relative overflow-hidden"
      style={{ background: `rgba(17, 20, 24, ${bgOpacity.toFixed(2)})` }}
    >
      {/* Accent glow when running */}
      {runningBlock && <div className="absolute inset-y-0 left-0 w-16 bg-accent/8 blur-lg pointer-events-none" />}

      <div className="flex items-center gap-2.5 flex-1 min-w-0 z-10">
        {runningBlock ? (
          <>
            <span className="w-2 h-2 rounded-full bg-accent ring-pulse flex-shrink-0" />
            <span className="text-sm font-medium text-text-primary truncate" title={runningBlock.title}>
              {runningBlock.title}
            </span>
            <span className="text-xs text-text-muted font-mono tabular-nums flex-shrink-0 bg-surface-elevated px-1.5 py-0.5 rounded border border-border">
              {formatElapsed(elapsed)}
            </span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-border flex-shrink-0" />
            <span className="text-xs text-text-muted">No task running</span>
          </>
        )}
      </div>

      {runningBlock && (
        <button
          onClick={handleStop}
          className="w-6 h-6 flex items-center justify-center rounded-md bg-red-500/15 border border-red-500/30 hover:bg-red-500 transition-all z-10 group flex-shrink-0"
          aria-label="Stop task"
        >
          <span className="w-2 h-2 bg-red-400 group-hover:bg-white rounded-[2px] transition-colors" />
        </button>
      )}

      <button
        onClick={onOpenSettings}
        className="w-6 h-6 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors z-10 flex-shrink-0 border border-transparent hover:border-border"
        aria-label="Open settings"
        title="Settings"
      >
        <Settings2 size={13} strokeWidth={1.75} />
      </button>
    </div>
  )
}
