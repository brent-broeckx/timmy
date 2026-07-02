// src/renderer/src/components/Overlay/OverlayPanel.tsx
// Main application panel: running task header + Start/End Day + timeline + nav.

import { useEffect, useState, useRef } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useConfigStore } from '../../store/useConfigStore'
import { ipc } from '../../ipc'
import { AnchorWidget } from '../Anchor/AnchorWidget'
import { Timeline } from '../Timeline/Timeline'
import { WorkOrderSettings } from '../Settings/WorkOrderSettings'
import { AppearanceSettings } from '../Settings/AppearanceSettings'
import { CalendarSettings } from '../Settings/CalendarSettings'
import type { TimeBlock } from '@shared/types'

type View = 'timeline' | 'settings' | 'appearance' | 'calendar'

const CALENDAR_ENABLED = import.meta.env.VITE_CALENDAR_ENABLED === 'true'

export function OverlayPanel(): React.JSX.Element {
  const [view, setView] = useState<View>('timeline')
  // Incremented each time the panel becomes visible — forces the slide-in animation to replay
  const [showCount, setShowCount] = useState(0)
  const loadDay = useTimelineStore((s) => s.loadDay)
  const dayBoundary = useTimelineStore((s) => s.dayBoundary)
  const startDay = useTimelineStore((s) => s.startDay)
  const endDay = useTimelineStore((s) => s.endDay)
  const continueDay = useTimelineStore((s) => s.continueDay)
  const { load: loadConfig } = useConfigStore()
  const anchorPosition = useConfigStore((s) => s.config.anchorPosition)
  const glassIntensity = useConfigStore((s) => s.config.glassIntensity)

  const today = new Date().toISOString().split('T')[0]

  // Keep a stable ref to today so the task handler closure doesn't go stale
  const todayRef = useRef(today)

  useEffect(() => {
    void loadConfig()
    void loadDay(today)

    // Use syncBlockLocal instead of loadDay to avoid overwriting in-progress slider edits
    const handleTaskChanged = (block: TimeBlock): void => {
      useTimelineStore.getState().syncBlockLocal(block)
    }
    ipc.onTaskChanged(handleTaskChanged)

    const handleProjectsChanged = (): void => {
      void loadConfig()
    }
    ipc.onProjectsChanged(handleProjectsChanged)

    const handleVisibility = (visible: boolean): void => {
      if (visible) setShowCount((c) => c + 1)
    }
    ipc.onOverlayVisibility(handleVisibility)

    return () => {
      ipc.offTaskChanged(handleTaskChanged)
      ipc.offProjectsChanged(handleProjectsChanged)
      ipc.offOverlayVisibility(handleVisibility)
    }
  }, [])

  const handleStartDay = async (): Promise<void> => {
    await startDay(todayRef.current)
    // Auto-fetch calendar events when starting the day
    try {
      await ipc.calendar.fetchEvents(todayRef.current)
    } catch {
      // Calendar may not be connected — that's fine, silently ignore
    }
  }
  const handleEndDay = (): void => { endDay(todayRef.current) }
  const handleContinueDay = (): void => { continueDay(todayRef.current) }

  // Map corner to CSS animation class for the slide-in direction
  const slideClass: Record<string, string> = {
    TL: 'animate-slide-from-tl',
    TR: 'animate-slide-from-tr',
    BL: 'animate-slide-from-bl',
    BR: 'animate-slide-from-br',
  }

  // Glass: at intensity 0 = 0.88 opacity (near opaque); at 100 = 0.08 (very transparent)
  // Low CSS opacity lets the OS-level acrylic blur show through
  const bgOpacity = 1 - (glassIntensity / 100) * 0.80

  return (
    <div
      key={showCount}
      className={[
        'flex flex-col h-screen text-text-primary overflow-hidden rounded-xl shadow-2xl',
        slideClass[anchorPosition] ?? '',
      ].join(' ')}
      style={{
        background: `rgba(15, 15, 26, ${bgOpacity.toFixed(2)})`,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
      } as React.CSSProperties}
    >
      {/* Title bar / drag region with window controls */}
      <div
        className="flex-shrink-0 h-10 bg-white/5 flex items-center px-3 gap-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs text-text-muted select-none flex-1">
          Timmy
        </span>
        {/* Window controls (no-drag so they're clickable) */}
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => ipc.window.minimizeOverlay()}
            className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-300 transition-colors flex-shrink-0"
            aria-label="Minimize"
            title="Minimize"
          />
          <button
            onClick={() => ipc.window.hideOverlay()}
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex-shrink-0"
            aria-label="Close"
            title="Close (hides to tray)"
          />
        </div>
      </div>

      {/* Running task strip */}
      <div className="flex-shrink-0">
        <AnchorWidget onOpenSettings={() => setView(view === 'settings' ? 'timeline' : 'settings')} />
      </div>

      {/* Day controls */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <span className="text-xs text-text-muted flex-1">
          {today} {dayBoundary ? `· started ${new Date(dayBoundary.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          {dayBoundary?.endTime ? ` → ${new Date(dayBoundary.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
        {!dayBoundary ? (
          <button onClick={handleStartDay} className="text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent/90 transition-colors">
            Start Day
          </button>
        ) : !dayBoundary.endTime ? (
          <button onClick={handleEndDay} className="text-xs px-3 py-1 rounded border border-white/20 text-text-muted hover:text-text-primary hover:border-white/40 transition-colors">
            End Day
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Day ended</span>
            <button onClick={handleContinueDay} className="text-xs px-3 py-1 rounded border border-white/20 text-text-muted hover:text-text-primary hover:border-white/40 transition-colors">
              Continue
            </button>
          </div>
        )}
        {CALENDAR_ENABLED && (
          <button
            onClick={() => setView(view === 'calendar' ? 'timeline' : 'calendar')}
            className={['text-text-muted hover:text-text-primary transition-colors text-sm px-1', view === 'calendar' ? 'text-accent' : ''].join(' ')}
            aria-label="Calendar settings"
            title="Calendar"
          >
            📅
          </button>
        )}
        <button
          onClick={() => setView(view === 'appearance' ? 'timeline' : 'appearance')}
          className={['text-text-muted hover:text-text-primary transition-colors text-sm px-1', view === 'appearance' ? 'text-accent' : ''].join(' ')}
          aria-label="Appearance settings"
          title="Appearance"
        >
          🎨
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {view === 'timeline' && <Timeline />}
        {view === 'settings' && <WorkOrderSettings />}
        {view === 'appearance' && <AppearanceSettings />}
        {view === 'calendar' && CALENDAR_ENABLED && <CalendarSettings />}
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 px-4 py-1.5 border-t border-white/10 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          <kbd className="border border-white/20 rounded px-1">Ctrl+Shift+Space</kbd> to capture
        </span>
        <span className="text-xs text-text-muted">
          <kbd className="border border-white/20 rounded px-1">Ctrl+Z</kbd> undo
        </span>
      </div>
    </div>
  )
}

