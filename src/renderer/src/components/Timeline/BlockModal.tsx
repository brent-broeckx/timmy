// src/renderer/src/components/Timeline/BlockModal.tsx
// Create or edit a time block. Opens as a modal overlay.
// Supports: title, date, start time, end time, project, work order, notes.

import { useState, useEffect, useRef } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useConfigStore } from '../../store/useConfigStore'
import { toDecimalHours } from '@shared/types'
import type { TimeBlock } from '@shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoToTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Convert local date + time strings to UTC ISO. */
function toISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

/** Calculate duration in minutes between two ISO strings. */
function durationMinutes(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60_000
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Existing block to edit, or null to create a new one. */
  block: TimeBlock | null
  /** Pre-fill start time for new blocks (ISO string). */
  initialStartTime: string | null
  /** Pre-fill date for new blocks (YYYY-MM-DD). */
  initialDate: string
  onClose: () => void
  onDelete: (id: string, title: string) => void
}

export function BlockModal({ block, initialStartTime, initialDate, onClose, onDelete }: Props): React.JSX.Element {
  const addBlock = useTimelineStore((s) => s.addBlock)
  const updateBlock = useTimelineStore((s) => s.updateBlock)
  const projects = useConfigStore((s) => s.projects)

  const isNew = block === null
  const titleRef = useRef<HTMLInputElement>(null)

  // ── Form state ──
  const [title, setTitle] = useState(block?.title ?? '')
  const [date, setDate] = useState(
    block ? isoToDate(block.startTime) : initialDate,
  )
  const [startTime, setStartTime] = useState(
    block ? isoToTime(block.startTime) : (initialStartTime ? isoToTime(initialStartTime) : '09:00'),
  )
  const [endTime, setEndTime] = useState(
    block?.endTime ? isoToTime(block.endTime) : '',
  )
  const [projectId, setProjectId] = useState(block?.projectId ?? '')
  const [workOrderId, setWorkOrderId] = useState(block?.workOrderId ?? '')
  const [notes, setNotes] = useState(block?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { titleRef.current?.focus() }, [])

  const selectedProject = projects.find((p) => p.id === projectId)
  const workOrders = selectedProject?.workOrders ?? []

  const handleSave = async (): Promise<void> => {
    setError('')
    if (!title.trim()) { setError('Title is required'); return }
    if (!startTime) { setError('Start time is required'); return }
    if (endTime && endTime <= startTime && date === isoToDate(toISO(date, endTime))) {
      setError('End time must be after start time'); return
    }

    setSaving(true)
    try {
      const startISO = toISO(date, startTime)
      const endISO = endTime ? toISO(date, endTime) : null
      const durMin = endISO ? durationMinutes(startISO, endISO) : null
      const decHours = durMin !== null ? toDecimalHours(durMin) : null

      if (isNew) {
        const newBlock: TimeBlock = {
          id: crypto.randomUUID(),
          date,
          startTime: startISO,
          endTime: endISO,
          title: title.trim(),
          notes: notes.trim() || null,
          projectId: projectId || null,
          workOrderId: workOrderId || null,
          source: 'manual',
          sourceId: null,
          durationMinutes: durMin,
          decimalHours: decHours,
          deleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await addBlock(newBlock)
      } else {
        const updated: TimeBlock = {
          ...block,
          date,
          startTime: startISO,
          endTime: endISO,
          title: title.trim(),
          notes: notes.trim() || null,
          projectId: projectId || null,
          workOrderId: workOrderId || null,
          durationMinutes: durMin,
          decimalHours: decHours,
          updatedAt: new Date().toISOString(),
        }
        await updateBlock(updated)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSave() }
    if (e.key === 'Escape') onClose()
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal */}
      <div
        className="bg-surface-elevated border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border bg-surface/50 rounded-t-xl">
          <h2 className="text-base font-semibold text-text-primary">
            {isNew ? 'Add block' : 'Edit block'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1.5 uppercase tracking-wider">Title</label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What were you working on?"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/70 focus:ring-1 focus:ring-accent/70 transition-all shadow-sm"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-surface-elevated border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Times */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-text-muted block mb-1">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-text-muted block mb-1">
                End time <span className="text-text-muted opacity-60">(optional)</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          {/* Project */}
          {projects.length > 0 && (
            <div>
              <label className="text-xs text-text-muted block mb-1">Project</label>
              <select
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setWorkOrderId('') }}
                className="w-full bg-surface-elevated border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">— no project —</option>
                {projects.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Work order */}
          {workOrders.length > 0 && (
            <div>
              <label className="text-xs text-text-muted block mb-1">Work order</label>
              <select
                value={workOrderId}
                onChange={(e) => setWorkOrderId(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">— none —</option>
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>{wo.code} — {wo.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes…"
              className="w-full bg-surface-elevated border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 pb-5 pt-4 border-t border-border bg-surface/50 rounded-b-xl">
          {!isNew && (
            <button
              onClick={() => { onDelete(block.id, block.title) }}
              className="text-xs font-medium px-4 py-2 rounded-lg border border-red-500/60 text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-colors"
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-xs font-medium px-4 py-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="text-xs font-medium px-5 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-lg shadow-accent/20"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
