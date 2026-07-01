// src/renderer/src/components/Overlay/OverlayPanel.tsx
// Main application panel: anchor widget + Start/End Day + timeline + nav.

import { useEffect, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useConfigStore } from '../../store/useConfigStore'
import { ipc } from '../../ipc'
import { AnchorWidget } from '../Anchor/AnchorWidget'
import { Timeline } from '../Timeline/Timeline'
import { WorkOrderSettings } from '../Settings/WorkOrderSettings'

type View = 'timeline' | 'settings'

export function OverlayPanel(): React.JSX.Element {
  const [view, setView] = useState<View>('timeline')
  const loadDay = useTimelineStore((s) => s.loadDay)
  const dayBoundary = useTimelineStore((s) => s.dayBoundary)
  const startDay = useTimelineStore((s) => s.startDay)
  const endDay = useTimelineStore((s) => s.endDay)
  const continueDay = useTimelineStore((s) => s.continueDay)
  const { load: loadConfig } = useConfigStore()

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadConfig()
    loadDay(today)

    // Reload state when a task starts/stops in the quick-capture window
    const handleTaskChanged = (): void => { loadDay(today) }
    ipc.onTaskChanged(handleTaskChanged)
    return () => ipc.offTaskChanged(handleTaskChanged)
  }, [])

  const handleStartDay = (): void => {
    startDay(today)
  }

  const handleEndDay = (): void => {
    endDay(today)
  }

  const handleContinueDay = (): void => {
    continueDay(today)
  }

  return (
    <div className="flex flex-col h-screen bg-background text-text-primary overflow-hidden">
      {/* Title bar / drag region */}
      <div
        className="flex-shrink-0 h-8 bg-surface-elevated flex items-center px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs text-text-muted select-none" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          Timmy
        </span>
      </div>

      {/* Anchor widget */}
      <div className="flex-shrink-0">
        <AnchorWidget onOpenSettings={() => setView(view === 'settings' ? 'timeline' : 'settings')} />
      </div>

      {/* Day controls */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
        <span className="text-xs text-text-muted flex-1">
          {today} {dayBoundary ? `· started ${new Date(dayBoundary.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          {dayBoundary?.endTime ? ` → ${new Date(dayBoundary.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>

        {!dayBoundary ? (
          <button
            onClick={handleStartDay}
            className="text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Start Day
          </button>
        ) : !dayBoundary.endTime ? (
          <button
            onClick={handleEndDay}
            className="text-xs px-3 py-1 rounded border border-border text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
          >
            End Day
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Day ended</span>
            <button
              onClick={handleContinueDay}
              className="text-xs px-3 py-1 rounded border border-border text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
            >
              Continue
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {view === 'timeline' ? <Timeline /> : <WorkOrderSettings />}
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 px-4 py-1.5 border-t border-border flex items-center justify-between">
        <span className="text-xs text-text-muted">
          <kbd className="border border-border rounded px-1">Ctrl+Shift+Space</kbd> to capture
        </span>
        <span className="text-xs text-text-muted">
          <kbd className="border border-border rounded px-1">Ctrl+Z</kbd> undo
        </span>
      </div>
    </div>
  )
}
