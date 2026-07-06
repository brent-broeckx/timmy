// src/renderer/src/components/Submit/DateRangePicker.tsx
// Lets the user pick a start and end date for the submit run.
// Constraints:
//   - Start and end must be in the same calendar month
//   - End date must be >= start date
//   - Maximum range: entire calendar month
// Optionally shows which dates have submittable time entries.

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ipc } from '../../ipc'
import type { SubmitEntry } from '@shared/types'

type Props = {
  onRangeConfirmed: (startDate: string, endDate: string) => void
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number): number {
  // 0 = Sunday … 6 = Saturday; convert to Mon=0…Sun=6
  const d = new Date(year, month, 1).getDay()
  return (d + 6) % 7
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── Component ────────────────────────────────────────────────────────────────

export function DateRangePicker({ onRangeConfirmed }: Props): React.JSX.Element {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [entryDates, setEntryDates] = useState<Set<string>>(new Set())

  // Clamp to the last day of startDate's month
  function clampEnd(start: string, end: string): string {
    const [sy, sm] = start.split('-').map(Number)
    const [ey, em] = end.split('-').map(Number)
    if (sy !== ey || sm !== em) {
      const lastDay = daysInMonth(sy, sm - 1)
      return isoDate(sy, sm - 1, lastDay)
    }
    return end
  }

  // Load entry dates whenever view month changes
  useEffect(() => {
    const firstDay = isoDate(viewYear, viewMonth, 1)
    const lastDay = isoDate(viewYear, viewMonth, daysInMonth(viewYear, viewMonth))
    ipc.submit.getEntries(firstDay, lastDay)
      .then((entries: SubmitEntry[]) => {
        setEntryDates(new Set(entries.map((e) => e.date)))
      })
      .catch(() => {/* silently skip if not yet configured */})
  }, [viewYear, viewMonth])

  function handleDayClick(date: string): void {
    if (!startDate || (startDate && endDate)) {
      // Start a new range
      setStartDate(date)
      setEndDate(null)
      return
    }

    // We have a start but no end yet
    if (date < startDate) {
      // Clicked before start — reset with new start
      setStartDate(date)
      setEndDate(null)
      return
    }

    // Clamp end to same month as start
    const clamped = clampEnd(startDate, date)
    setEndDate(clamped)
  }

  function isInRange(date: string): boolean {
    if (!startDate) return false
    const effectiveEnd = endDate ?? hoverDate
    if (!effectiveEnd) return false
    if (date < startDate) return false

    // Cross-month: clamp end
    const [sy, sm] = startDate.split('-').map(Number)
    const [dy, dm] = date.split('-').map(Number)
    if (sy !== dy || sm !== dm) return false

    return date <= effectiveEnd
  }

  function isDisabled(date: string): boolean {
    if (!startDate || endDate) return false
    // When selecting end: disable dates in different months than start
    const [sy, sm] = startDate.split('-').map(Number)
    const [dy, dm] = date.split('-').map(Number)
    if (sy !== dy || sm !== dm) return true
    if (date < startDate) return false // will reset start
    return false
  }

  function prevMonth(): void {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
    setStartDate(null); setEndDate(null)
  }

  function nextMonth(): void {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
    setStartDate(null); setEndDate(null)
  }

  function formatRange(): string {
    if (!startDate) return 'Select a start date'
    if (!endDate) return `From ${startDate} — select end date`
    const days =
      Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1
    return `${startDate} → ${endDate} (${days} day${days !== 1 ? 's' : ''})`
  }

  function canConfirm(): boolean {
    return !!(startDate && endDate)
  }

  // Build calendar grid
  const numDays = daysInMonth(viewYear, viewMonth)
  const startOffset = firstDayOfMonth(viewYear, viewMonth)
  const cells: Array<string | null> = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: numDays }, (_, i) => isoDate(viewYear, viewMonth, i + 1)),
  ]
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="flex flex-col gap-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-sm font-semibold text-text-primary">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-text-muted py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />

          const isStart = date === startDate
          const isEnd = date === endDate
          const inRange = isInRange(date)
          const disabled = isDisabled(date)
          const hasEntries = entryDates.has(date)
          const isToday = date === today.toISOString().split('T')[0]

          return (
            <button
              key={date}
              onClick={() => !disabled && handleDayClick(date)}
              onMouseEnter={() => setHoverDate(date)}
              onMouseLeave={() => setHoverDate(null)}
              disabled={disabled}
              className={[
                'relative flex flex-col items-center justify-center h-9 rounded-md text-sm transition-colors duration-75',
                disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer',
                isStart || isEnd
                  ? 'bg-accent text-white font-semibold'
                  : inRange
                  ? 'bg-accent/20 text-text-primary'
                  : isToday
                  ? 'border border-accent/40 text-accent'
                  : 'text-text-primary hover:bg-white/[0.06]',
              ].join(' ')}
            >
              {date.split('-')[2].replace(/^0/, '')}
              {hasEntries && (
                <span
                  className={[
                    'absolute bottom-1 w-1 h-1 rounded-full',
                    isStart || isEnd ? 'bg-white/70' : 'bg-accent/60',
                  ].join(' ')}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Range summary */}
      <div className="text-xs text-text-muted text-center py-1 px-2 bg-surface rounded-md">
        {formatRange()}
      </div>

      {/* Confirm button */}
      <button
        disabled={!canConfirm()}
        onClick={() => {
          if (startDate && endDate) onRangeConfirmed(startDate, endDate)
        }}
        className={[
          'w-full py-2 rounded-lg text-sm font-semibold transition-all',
          canConfirm()
            ? 'bg-accent text-white hover:bg-accent/90 shadow-[0_0_12px_rgba(14,165,233,0.25)]'
            : 'bg-surface text-text-muted cursor-not-allowed',
        ].join(' ')}
      >
        Confirm Range
      </button>
    </div>
  )
}
