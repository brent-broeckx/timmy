// src/renderer/src/components/Anchor/AnchorRoot.tsx
// Standalone root rendered in the persistent anchorWindow.
// Always on top, non-focusable. Clicking (or hovering) opens the overlay panel.

import { useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useConfigStore } from '../../store/useConfigStore'
import { ipc } from '../../ipc'
import { formatElapsed } from '@shared/types'
import type { TimeBlock } from '@shared/types'

export function AnchorRoot(): React.JSX.Element {
  const { load: loadConfig } = useConfigStore()
  const anchorMode = useConfigStore((s) => s.config.anchorMode)
  const anchorTrigger = useConfigStore((s) => s.config.anchorTrigger)
  // Use the most recently started running block (last in startTime-sorted array)
  const runningBlock = useTimelineStore((s) => {
    const running = s.blocks.filter((b) => b.endTime === null)
    return running.length > 0 ? running[running.length - 1] : null
  })
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    loadConfig()
    useTimelineStore.getState().loadDay(today)

    const handleTaskChanged = (block: TimeBlock): void => {
      useTimelineStore.getState().syncBlockLocal(block)
    }
    ipc.onTaskChanged(handleTaskChanged)
    return () => ipc.offTaskChanged(handleTaskChanged)
  }, [])

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

  const handleOpen = (): void => {
    ipc.window.toggleOverlay()
  }

  const handleMouseEnter = (): void => {
    if (anchorTrigger === 'hover') ipc.window.showOverlay()
  }

  if (anchorMode === 'hidden') {
    ipc.window.hideAnchor()
    return <></>
  }

  if (anchorMode === 'dot-only') {
    return (
      <div
        className="w-full h-full flex items-center justify-center cursor-pointer select-none"
        onClick={handleOpen}
        onMouseEnter={handleMouseEnter}
        title={runningBlock ? `${runningBlock.title} — ${formatElapsed(elapsed)}` : 'No task running'}
      >
        <span
          className={[
            'w-3 h-3 rounded-full',
            runningBlock ? 'bg-accent ring-pulse' : 'bg-text-muted',
          ].join(' ')}
        />
      </div>
    )
  }

  return (
    <div
      className="w-full h-full flex items-center gap-2 px-3 cursor-pointer select-none rounded-xl glass-panel"
      style={{
        border: '1px solid rgba(14, 165, 233, 0.18)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.4)',
      }}
      onClick={handleOpen}
      onMouseEnter={handleMouseEnter}
    >
      <span
        className={[
          'w-2 h-2 rounded-full flex-shrink-0',
          runningBlock ? 'bg-accent ring-pulse' : 'bg-border',
        ].join(' ')}
      />
      <span className="text-xs font-medium text-text-primary truncate flex-1 min-w-0" title={runningBlock?.title}>
        {runningBlock ? runningBlock.title : 'No task running'}
      </span>
      {runningBlock && (
        <span className="text-xs text-text-muted font-mono tabular-nums flex-shrink-0">
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  )
}

