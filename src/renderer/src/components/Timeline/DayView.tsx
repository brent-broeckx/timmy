// src/renderer/src/components/Timeline/DayView.tsx
// Vertical time-grid (Google Calendar style) for a single day.
// Blocks are absolutely positioned at their actual time with proportional height.
// Overlapping blocks appear side-by-side in columns via computeLayout().

import { useMemo, useRef, useEffect, useState } from 'react'
import { computeLayout } from './layout'
import { useConfigStore } from '../../store/useConfigStore'
import { ipc } from '../../ipc'
import type { TimeBlock, CalendarEvent } from '@shared/types'

type ContextMenu = { x: number; y: number; block: TimeBlock } | null

const HOUR_HEIGHT = 64 // pixels per hour
const START_HOUR = 6 // 06:00
const END_HOUR = 23 // 23:00
const TOTAL_HOURS = END_HOUR - START_HOUR // 17 hours = 1088 px
const MIN_BLOCK_HEIGHT = 24

function blockY(iso: string): number {
  const d = new Date(iso)
  return ((d.getHours() * 60 + d.getMinutes() - START_HOUR * 60) / 60) * HOUR_HEIGHT
}

function nowY(nowMinutes: number): number {
  return ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

interface Props {
  blocks: TimeBlock[]
  date: string           // YYYY-MM-DD
  isToday: boolean
  calendarEvents: CalendarEvent[]
  onEditBlock: (block: TimeBlock) => void
  onAddAtTime: (isoTime: string) => void
  onDeleteBlock: (id: string, title: string) => void
  onCalendarEventsChanged: () => void
}

export function DayView({ blocks, date, isToday, calendarEvents, onEditBlock, onAddAtTime, onDeleteBlock, onCalendarEventsChanged }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const projects = useConfigStore((s) => s.projects)

  const [contextMenu, setContextMenu] = useState<ContextMenu>(null)

  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })

  // Update "now" marker every minute (only needed for today)
  useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => {
      const n = new Date()
      setNowMinutes(n.getHours() * 60 + n.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [isToday])

  // Scroll so current time (or start of day) is roughly centred on mount
  useEffect(() => {
    if (!containerRef.current) return
    const targetHour = isToday
      ? Math.max(START_HOUR, Math.floor(nowMinutes / 60) - 2)
      : START_HOUR
    containerRef.current.scrollTop = (targetHour - START_HOUR) * HOUR_HEIGHT
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const layoutBlocks = useMemo(() => computeLayout(blocks), [blocks])

  const totalHeight = TOTAL_HOURS * HOUR_HEIGHT
  const currentNowY = nowY(nowMinutes)

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Ignore clicks that landed on a block
    if ((e.target as HTMLElement).closest('[data-block]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const rawMinutes = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60
    const snappedMinutes = Math.round(rawMinutes / 15) * 15 // snap to 15-min grid
    const h = Math.min(Math.floor(snappedMinutes / 60), END_HOUR - 1)
    const m = snappedMinutes % 60
    const isoTime = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString()
    onAddAtTime(isoTime)
  }

  const blockHeight = (block: typeof layoutBlocks[0]): number => {
    const top = blockY(block.startTime)
    if (block.endTime) {
      return Math.max(blockY(block.endTime) - top, MIN_BLOCK_HEIGHT)
    }
    // Running block: grow to current time
    return Math.max(currentNowY - top, MIN_BLOCK_HEIGHT)
  }

  const [pullingEventId, setPullingEventId] = useState<string | null>(null)

  async function handlePullEvent(eventId: string): Promise<void> {
    setPullingEventId(eventId)
    try {
      await ipc.calendar.pullEvent(eventId)
      onCalendarEventsChanged()
    } catch (err) {
      console.error('[DayView] pullEvent failed:', err)
    } finally {
      setPullingEventId(null)
    }
  }

  const allDayEvents = calendarEvents.filter((e) => e.isAllDay)

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* ── All-day events strip (non-scrolling) ── */}
      {allDayEvents.length > 0 && (
        <div className="flex-shrink-0 border-b border-white/10 px-4 py-2 space-y-1">
          <p className="text-xs text-text-muted mb-1">All-day</p>
          {allDayEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-accent/5 border border-accent/15 px-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">{event.title}</p>
                {event.organizer && (
                  <p className="text-xs text-text-muted truncate">{event.organizer}</p>
                )}
              </div>
              {!event.importedToTimeline ? (
                <button
                  onClick={() => handlePullEvent(event.id)}
                  disabled={pullingEventId === event.id}
                  title="Pull into timeline as a block"
                  className="flex-shrink-0 text-xs px-2 py-0.5 rounded border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {pullingEventId === event.id ? '…' : '→ Timeline'}
                </button>
              ) : (
                <span className="flex-shrink-0 text-xs text-text-muted">Added</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Scrollable time grid ── */}
      <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
      <div style={{ height: totalHeight, position: 'relative', display: 'flex' }}>
        <div className="flex-shrink-0 relative select-none" style={{ width: 52 }}>
          {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
            <div
              key={i}
              className="absolute right-2 text-xs text-text-muted leading-none"
              style={{ top: i * HOUR_HEIGHT - 7 }}
            >
              {String(START_HOUR + i).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* ── Grid + blocks ── */}
        <div
          className="flex-1 relative cursor-crosshair"
          style={{ paddingRight: 8 }}
          onClick={handleGridClick}
        >
          {/* Hour dividers */}
          {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-white/10"
              style={{ top: i * HOUR_HEIGHT }}
            />
          ))}
          {/* Half-hour dividers */}
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <div
              key={`h${i}`}
              className="absolute left-0 right-0 border-t border-white/[0.04]"
              style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
            />
          ))}

          {/* Current time indicator */}
          {isToday && currentNowY > 0 && currentNowY < totalHeight && (
            <div
              className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
              style={{ top: currentNowY - 1 }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-accent flex-shrink-0 -ml-1.5" />
              <div className="flex-1 h-0.5 bg-accent opacity-70" />
            </div>
          )}

          {/* Context menu */}
          {contextMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setContextMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }}
              />
              <div
                className="fixed z-50 bg-surface-elevated border border-border rounded-lg py-1 shadow-xl text-sm min-w-[120px]"
                style={{ top: contextMenu.y, left: contextMenu.x }}
              >
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-border text-red-400"
                  onClick={() => {
                    onDeleteBlock(contextMenu.block.id, contextMenu.block.title)
                    setContextMenu(null)
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}

          {/* Blocks */}
          {layoutBlocks.map((block) => {
            const top = blockY(block.startTime)
            const height = blockHeight(block)
            const colW = 100 / block.totalColumns
            const isRunning = block.endTime === null
            const needsWorkOrder = !block.workOrderId
            const durationMin = block.durationMinutes ?? (
              isRunning
                ? nowMinutes - (new Date(block.startTime).getHours() * 60 + new Date(block.startTime).getMinutes())
                : null
            )
            const project = projects.find((p) => p.id === block.projectId) ?? null
            const workOrder = project?.workOrders.find((wo) => wo.id === block.workOrderId) ?? null

            return (
              <div
                key={block.id}
                data-block="1"
                className={[
                  'absolute rounded-lg border overflow-hidden cursor-pointer transition-all group',
                  needsWorkOrder
                    ? 'ring-1 ring-amber-300/30'
                    : '',
                  isRunning
                    ? 'bg-accent/20 border-accent/50 hover:bg-accent/30 hover:border-accent/80'
                    : needsWorkOrder
                      ? 'bg-amber-400/8 border-amber-300/35 hover:bg-amber-400/12 hover:border-amber-200/50'
                      : 'bg-surface border-border hover:border-accent/40 hover:bg-surface-elevated',
                ].join(' ')}
                style={{
                  top,
                  height,
                  left: `calc(${block.columnIndex * colW}% + 2px)`,
                  width: `calc(${colW}% - 4px)`,
                  padding: '3px 7px',
                  minHeight: MIN_BLOCK_HEIGHT,
                }}
                onClick={(e) => { e.stopPropagation(); onEditBlock(block) }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, block }) }}
                title={`${block.title}\n${formatTime(block.startTime)}${block.endTime ? ` → ${formatTime(block.endTime)}` : ' → running'}${durationMin ? `\n${formatDuration(durationMin)}` : ''}`}
              >
                {/* Running pulse dot */}
                {isRunning && (
                  <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent ring-pulse flex-shrink-0" />
                )}

                <div className="flex items-center gap-1 min-w-0 pr-3">
                  <p className="text-xs font-semibold text-text-primary leading-tight truncate flex-1 min-w-0">
                    {block.title}
                  </p>
                  {workOrder ? (
                    <span className="text-xs text-text-muted shrink-0 truncate max-w-[40%]">
                      {workOrder.code}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200 shrink-0">
                      WO needed
                    </span>
                  )}
                </div>

                {height >= 44 && (
                  <p className="text-xs text-text-muted mt-0.5 leading-tight">
                    {formatTime(block.startTime)}
                    {block.endTime ? ` → ${formatTime(block.endTime)}` : ' → now'}
                  </p>
                )}

                {height >= 62 && durationMin !== null && (
                  <p className="text-xs text-text-muted mt-0.5">{formatDuration(durationMin)}</p>
                )}
              </div>
            )
          })}

          {/* Hint: click to add */}
          {blocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-text-muted text-sm">Click a time slot to add a block</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
