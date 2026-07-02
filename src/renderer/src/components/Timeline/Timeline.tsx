// src/renderer/src/components/Timeline/Timeline.tsx
// Container: navigation toolbar + day/month view switcher.
// Handles keyboard undo and the soft-delete toast.

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useTaskStore } from '../../store/useTaskStore'
import { ipc } from '../../ipc'
import { DayView } from './DayView'
import { MonthView } from './MonthView'
import { BlockModal } from './BlockModal'
import { SoftDeleteToast } from './SoftDeleteToast'
import type { TimeBlock, CalendarEvent } from '@shared/types'

type View = 'day' | 'month'

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function formatDayLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long', year: 'numeric',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Timeline(): React.JSX.Element {
  const today = new Date().toISOString().split('T')[0]

  const [view, setView] = useState<View>('day')
  const [date, setDate] = useState(today)
  const [monthState, setMonthState] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  })

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalBlock, setModalBlock] = useState<TimeBlock | null>(null)
  const [modalStartTime, setModalStartTime] = useState<string | null>(null)
  const [modalDate, setModalDate] = useState(today)

  // Soft-delete toast
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)

  // Calendar events for the current day view
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])

  const dateRef = useRef(date)

  const blocks = useTimelineStore((s) => s.blocks)
  const isLoading = useTimelineStore((s) => s.isLoading)
  const loadDay = useTimelineStore((s) => s.loadDay)
  const deleteBlock = useTimelineStore((s) => s.deleteBlock)
  const undo = useTimelineStore((s) => s.undo)
  const currentTask = useTaskStore((s) => s.currentTask)
  const clearCurrentTask = useTaskStore((s) => s.clearCurrentTask)

  // Keep a stable ref so Ctrl+Z handler closure is always fresh
  const undoRef = useRef(undo)
  const currentTaskRef = useRef(currentTask)
  const clearRef = useRef(clearCurrentTask)
  useEffect(() => { undoRef.current = undo }, [undo])
  useEffect(() => { currentTaskRef.current = currentTask }, [currentTask])
  useEffect(() => { clearRef.current = clearCurrentTask }, [clearCurrentTask])
  useEffect(() => { dateRef.current = date }, [date])

  // ── Calendar events loading ────────────────────────────────────────────────

  const loadCalendarEvents = useCallback((d: string): void => {
    ipc.calendar.getEvents(d).then(setCalendarEvents).catch(() => {})
  }, [])

  useEffect(() => {
    if (view === 'day') loadCalendarEvents(date)
  }, [date, view, loadCalendarEvents])

  // React to periodic calendar refresh pushed from main process
  useEffect(() => {
    const handleCalendarUpdated = (updatedDate: string): void => {
      if (updatedDate === dateRef.current && view === 'day') {
        loadCalendarEvents(updatedDate)
        loadDay(updatedDate) // blocks may have new calendar imports
      }
    }
    ipc.onCalendarUpdated(handleCalendarUpdated)
    return () => ipc.offCalendarUpdated(handleCalendarUpdated)
  }, [loadCalendarEvents, loadDay, view])

  useEffect(() => {
    const handleProjectsChanged = (): void => {
      if (view === 'day') {
        void loadDay(dateRef.current)
      }
    }

    ipc.onProjectsChanged(handleProjectsChanged)
    return () => ipc.offProjectsChanged(handleProjectsChanged)
  }, [loadDay, view])

  // ── Navigation ────────────────────────────────────────────────────────────

  const goToDay = useCallback((d: string): void => {
    setDate(d)
    setView('day')
    loadDay(d)
    loadCalendarEvents(d)
  }, [loadDay, loadCalendarEvents])

  const handlePrev = (): void => {
    if (view === 'day') {
      const d = addDays(date, -1)
      setDate(d)
      loadDay(d)
    } else {
      const nd = new Date(monthState.year, monthState.month - 1, 1)
      setMonthState({ year: nd.getFullYear(), month: nd.getMonth() })
    }
  }

  const handleNext = (): void => {
    if (view === 'day') {
      const d = addDays(date, 1)
      setDate(d)
      loadDay(d)
    } else {
      const nd = new Date(monthState.year, monthState.month + 1, 1)
      setMonthState({ year: nd.getFullYear(), month: nd.getMonth() })
    }
  }

  const handleToday = (): void => {
    if (view === 'day') { goToDay(today) }
    else setMonthState({ year: new Date().getFullYear(), month: new Date().getMonth() })
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const openNewBlock = (startTime: string, forDate: string): void => {
    setModalBlock(null)
    setModalStartTime(startTime)
    setModalDate(forDate)
    setModalOpen(true)
  }

  const openEditBlock = (block: TimeBlock): void => {
    setModalBlock(block)
    setModalDate(block.date)
    setModalOpen(true)
  }

  const handleDelete = (id: string, title: string): void => {
    deleteBlock(id)
    setPendingDelete({ id, title })
  }

  // ── Global Ctrl+Z ─────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undoRef.current().then(() => {
        const updatedBlocks = useTimelineStore.getState().blocks
        if (currentTaskRef.current && !updatedBlocks.find(b => b.id === currentTaskRef.current!.id)) {
          clearRef.current()
        }
      })
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ── Render ────────────────────────────────────────────────────────────────

  const isToday = view === 'day' && date === today
  const canGoNext = view === 'month' || date < today
  const label = view === 'day'
    ? formatDayLabel(date)
    : formatMonthLabel(monthState.year, monthState.month)

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-white/10">
        {/* Prev */}
        <button
          onClick={handlePrev}
          className="w-6 h-6 flex items-center justify-center rounded text-lg leading-none text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
          title="Previous"
        >‹</button>

        {/* Today */}
        {!isToday && (
          <button
            onClick={handleToday}
            className="text-xs px-2 py-0.5 rounded border border-border text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
          >Today</button>
        )}

        {/* Next */}
        <button
          onClick={handleNext}
          disabled={!canGoNext}
          className="w-6 h-6 flex items-center justify-center rounded text-lg leading-none text-text-muted hover:text-text-primary hover:bg-white/10 disabled:opacity-30 transition-colors"
          title="Next"
        >›</button>

        {/* Date label */}
        <span className="flex-1 text-xs text-text-muted text-center truncate select-none">{label}</span>

        {/* Add block */}
        <button
          onClick={() => openNewBlock(new Date().toISOString(), view === 'day' ? date : today)}
          className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors"
          title="Add block manually"
        >+ Add</button>

        {/* View switcher */}
        <div className="flex rounded-lg overflow-hidden border border-border text-xs">
          <button
            onClick={() => setView('day')}
            className={`px-2 py-0.5 transition-colors ${view === 'day' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary hover:bg-white/10'}`}
          >Day</button>
          <button
            onClick={() => setView('month')}
            className={`px-2 py-0.5 transition-colors ${view === 'month' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary hover:bg-white/10'}`}
          >Month</button>
        </div>
      </div>

      {/* ── View content ── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
      ) : view === 'day' ? (
        <DayView
          blocks={blocks}
          date={date}
          isToday={isToday}
          calendarEvents={calendarEvents}
          onEditBlock={openEditBlock}
          onAddAtTime={(t) => openNewBlock(t, date)}
          onDeleteBlock={handleDelete}
          onCalendarEventsChanged={() => {
            loadCalendarEvents(date)
            loadDay(date)
          }}
        />
      ) : (
        <MonthView
          year={monthState.year}
          month={monthState.month}
          today={today}
          onDayClick={goToDay}
        />
      )}

      {/* ── Block create / edit modal ── */}
      {modalOpen && (
        <BlockModal
          block={modalBlock}
          initialStartTime={modalStartTime}
          initialDate={modalDate}
          onClose={() => setModalOpen(false)}
          onDelete={(id, title) => {
            handleDelete(id, title)
            setModalOpen(false)
          }}
        />
      )}

      {/* ── Soft-delete toast ── */}
      {pendingDelete && (
        <SoftDeleteToast
          message={`"${pendingDelete.title}" deleted`}
          onUndo={() => { setPendingDelete(null); void undo() }}
          onConfirm={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
