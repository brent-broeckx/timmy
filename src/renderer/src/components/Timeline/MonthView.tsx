// src/renderer/src/components/Timeline/MonthView.tsx
// Calendar grid showing all days in a month.
// Loads blocks via getRange IPC. Clicking a day navigates to day view.

import { useEffect, useState } from 'react'
import { ipc } from '../../ipc'
import type { TimeBlock } from '@shared/types'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateStr(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

interface Props {
  year: number
  month: number  // 0 = January
  today: string  // YYYY-MM-DD
  onDayClick: (date: string) => void
}

export function MonthView({ year, month, today, onDayClick }: Props): React.JSX.Element {
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const from = dateStr(year, month, 1)
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = dateStr(year, month, lastDay)
    ipc.timeline
      .getRange(from, to)
      .then(setBlocks)
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false))
  }, [year, month])

  // Group blocks by date string
  const byDate: Record<string, TimeBlock[]> = {}
  for (const b of blocks) {
    byDate[b.date] = (byDate[b.date] ?? []).concat(b)
  }

  // Build the 7-column calendar grid (Monday-first)
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 py-3 min-h-0">
      {loading && (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
      )}
      {!loading && (
        <>
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW.map((d) => (
              <div key={d} className="text-xs text-text-muted text-center py-1 select-none">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1 flex-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />

              const ds = dateStr(year, month, day)
              const dayBlocks = byDate[ds] ?? []
              const totalMinutes = dayBlocks.reduce((s, b) => s + (b.durationMinutes ?? 0), 0)
              const isToday = ds === today
              const isFuture = ds > today

              return (
                <div
                  key={i}
                  className={[
                    'rounded-lg border p-1.5 flex flex-col min-h-[56px] transition-colors',
                    isFuture
                      ? 'border-border/30 opacity-40 cursor-default'
                      : 'cursor-pointer',
                    isToday
                      ? 'border-accent/60 bg-accent/5 hover:bg-accent/10'
                      : !isFuture
                        ? 'border-border hover:border-border-hover hover:bg-surface-elevated'
                        : 'border-border',
                  ].join(' ')}
                  onClick={() => { if (!isFuture) onDayClick(ds) }}
                  title={ds}
                >
                  {/* Day number + total */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-semibold select-none ${isToday ? 'text-accent' : 'text-text-primary'}`}
                    >
                      {day}
                    </span>
                    {totalMinutes > 0 && (
                      <span className="text-xs text-text-muted select-none">
                        {totalMinutes >= 60
                          ? `${(totalMinutes / 60).toFixed(1)}h`
                          : `${Math.round(totalMinutes)}m`}
                      </span>
                    )}
                  </div>

                  {/* Task mini-labels */}
                  <div className="space-y-0.5 overflow-hidden">
                    {dayBlocks.slice(0, 3).map((b) => (
                      <div
                        key={b.id}
                        className="text-text-muted truncate leading-tight select-none"
                        style={{ fontSize: 10 }}
                      >
                        {b.title}
                      </div>
                    ))}
                    {dayBlocks.length > 3 && (
                      <div className="text-text-muted select-none" style={{ fontSize: 10 }}>
                        +{dayBlocks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
