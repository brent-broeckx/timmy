// src/renderer/src/components/Overlay/OverlayPanel.tsx
// Main application panel: running task header + Start/End Day + timeline + nav.

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useConfigStore } from '../../store/useConfigStore'
import { ipc } from '../../ipc'
import { AnchorWidget } from '../Anchor/AnchorWidget'
import { Timeline } from '../Timeline/Timeline'
import { SideNav } from './SideNav'
import { WorkOrderSettings } from '../Settings/WorkOrderSettings'
import { AppearanceSettings } from '../Settings/AppearanceSettings'
import { CalendarSettings } from '../Settings/CalendarSettings'
import { SubmitPanel } from '../Submit/SubmitPanel'
import type { TimeBlock } from '@shared/types'

type View = 'timeline' | 'settings' | 'appearance' | 'calendar' | 'submit'

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
        background: `rgba(10, 12, 16, ${bgOpacity.toFixed(2)})`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.07)',
      } as React.CSSProperties}
    >
      {/* Title bar with Timmy logo and macOS-style traffic lights */}
      <div
        className="flex-shrink-0 h-[42px] flex items-center px-4 gap-2.5"
        style={{
          WebkitAppRegion: 'drag',
          background: 'rgba(17, 20, 24, 0.9)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        } as React.CSSProperties}
      >
        {/* Timmy clock mark */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
          <circle cx="12" cy="12" r="10.5" stroke="#0ea5e9" strokeWidth="1.5"/>
          <line x1="12" y1="12" x2="12" y2="5" stroke="#0ea5e9" strokeWidth="1.75" strokeLinecap="round"/>
          <line x1="12" y1="12" x2="17" y2="9" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="12" cy="12" r="1.5" fill="#0ea5e9"/>
        </svg>
        <span
          className="text-[13px] font-semibold select-none flex-1"
          style={{ color: '#e2e8f0', letterSpacing: '-0.2px' }}
        >
          timmy
        </span>
        {/* Window controls */}
        <div
          className="flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => ipc.window.minimizeOverlay()}
            className="w-3 h-3 rounded-full bg-[#f5a623] hover:bg-[#f9c04a] transition-colors flex-shrink-0"
            aria-label="Minimize"
          />
          <button
            onClick={() => ipc.window.hideOverlay()}
            className="w-3 h-3 rounded-full bg-[#e0534a] hover:bg-[#e8706a] transition-colors flex-shrink-0"
            aria-label="Close (hides to tray)"
          />
        </div>
      </div>

      {/* Running task strip */}
      <div className="flex-shrink-0">
        <AnchorWidget onOpenSettings={() => setView(view === 'settings' ? 'timeline' : 'settings')} />
      </div>

      {/* Day controls */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-b border-border"
        style={{ background: `rgba(28, 31, 39, ${bgOpacity.toFixed(2)})` }}
      >
        <span className="text-sm font-medium text-text-primary flex-1">
          {today} {dayBoundary ? <span className="text-text-muted font-normal">· started {new Date(dayBoundary.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : ''}
          {dayBoundary?.endTime ? <span className="text-text-muted font-normal"> → {new Date(dayBoundary.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : ''}
        </span>
        {!dayBoundary ? (
          <button onClick={handleStartDay} className="text-sm px-4 py-1.5 rounded-lg bg-accent text-[#0a0c10] font-semibold hover:bg-accent-hover transition-colors shadow-[0_0_14px_rgba(14,165,233,0.22)]">
            Start Day
          </button>
        ) : !dayBoundary.endTime ? (
          <button onClick={handleEndDay} className="text-sm px-4 py-1.5 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-hover transition-colors bg-surface">
            End Day
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-muted">Day ended</span>
            <button onClick={handleContinueDay} className="text-sm px-4 py-1.5 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-hover transition-colors bg-surface">
              Continue
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-row">
        <SideNav currentView={view} onViewChange={setView} calendarEnabled={CALENDAR_ENABLED} />
        <div className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative">
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-[100px] pointer-events-none -z-10 mix-blend-screen mix-blend-plus-lighter" />
          <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="flex-1 flex flex-col p-5 overflow-y-auto"
              >
                {view === 'timeline' && <Timeline />}
                {view === 'settings' && <WorkOrderSettings />}
                {view === 'appearance' && <AppearanceSettings />}
                {view === 'calendar' && CALENDAR_ENABLED && <CalendarSettings />}
                {view === 'submit' && <SubmitPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
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

