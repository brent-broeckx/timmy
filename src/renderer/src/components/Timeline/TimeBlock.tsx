// src/renderer/src/components/Timeline/TimeBlock.tsx
// Individual time block in the day timeline.
// Supports: selection, time slider, soft-delete, project/work-order assignment.

import { useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { useConfigStore } from '../../store/useConfigStore'
import { formatDuration, toDecimalHours } from '@shared/types'
import type { TimeBlock as TBlock } from '@shared/types'

type Props = {
  block: TBlock
  onDeleteRequest: (id: string, title: string) => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function TimeBlock({ block, onDeleteRequest }: Props): React.JSX.Element {
  const selectedBlockId = useTimelineStore((s) => s.selectedBlockId)
  const setSelectedBlock = useTimelineStore((s) => s.setSelectedBlock)
  const updateBlock = useTimelineStore((s) => s.updateBlock)
  const projects = useConfigStore((s) => s.projects)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const isSelected = selectedBlockId === block.id
  const isRunning = block.endTime === null

  // ─── Duration display ────────────────────────────────────────────────────────

  const durationMin = block.durationMinutes
  const decHours = block.decimalHours ?? (durationMin !== null ? toDecimalHours(durationMin) : null)

  // ─── Slider ───────────────────────────────────────────────────────────────────

  const sliderValue = Math.round(durationMin ?? 30)

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const minutes = Number(e.target.value)
    if (!block.startTime) return
    const newEndTime = new Date(
      new Date(block.startTime).getTime() + minutes * 60_000,
    ).toISOString()
    updateBlock({
      ...block,
      endTime: newEndTime,
      durationMinutes: minutes,
      decimalHours: toDecimalHours(minutes),
    })
  }

  // ─── Delete flow ──────────────────────────────────────────────────────────────

  const triggerDelete = (): void => {
    setContextMenu(null)
    onDeleteRequest(block.id, block.title)
  }

  // ─── Keyboard handler ────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isSelected) {
        e.preventDefault()
        triggerDelete()
      }
    }
  }

  // ─── Context menu ────────────────────────────────────────────────────────────

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
    setSelectedBlock(block.id)
  }

  // ─── Project / work order assignment ─────────────────────────────────────────

  const currentProject = projects.find((p) => p.id === block.projectId) ?? null
  const workOrders = currentProject?.workOrders ?? []

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    updateBlock({ ...block, projectId: e.target.value || null, workOrderId: null })
  }

  const handleWorkOrderChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    updateBlock({ ...block, workOrderId: e.target.value || null })
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setSelectedBlock(isSelected ? null : block.id)}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        className={[
          'group relative rounded-lg border p-3 cursor-pointer transition-colors outline-none',
          isSelected
            ? 'border-accent bg-accent/10'
            : 'border-border bg-surface hover:border-border-hover',
          isRunning ? 'ring-1 ring-accent/40' : '',
        ].join(' ')}
        aria-selected={isSelected}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{block.title}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {formatTime(block.startTime)}
              {block.endTime ? ` → ${formatTime(block.endTime)}` : ' → running'}
            </p>
          </div>

          {/* Duration badges */}
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            {durationMin !== null && (
              <span className="text-xs font-mono text-text-primary">
                {formatDuration(durationMin)}
              </span>
            )}
            {decHours !== null && (
              <span className="text-xs font-mono text-text-muted">{decHours.toFixed(2)}h</span>
            )}
            {isRunning && (
              <span className="text-xs text-accent animate-pulse">●</span>
            )}
          </div>
        </div>

        {/* Expanded controls (when selected) */}
        {isSelected && (
          <div className="mt-3 space-y-3">
            {/* Time slider */}
            {!isRunning && durationMin !== null && (
              <div>
                <label className="text-xs text-text-muted mb-1 block">Adjust duration</label>
                <input
                  type="range"
                  min={5}
                  max={480}
                  step={5}
                  value={sliderValue}
                  onChange={handleSliderChange}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full accent-accent"
                  aria-label="Duration slider"
                />
                <div className="flex justify-between text-xs text-text-muted mt-0.5">
                  <span>5m</span>
                  <span className="text-text-primary font-mono">
                    {formatDuration(sliderValue)} / {toDecimalHours(sliderValue).toFixed(2)}h
                  </span>
                  <span>8h</span>
                </div>
              </div>
            )}

            {/* Project + Work Order selectors */}
            <div className="flex gap-2">
              <select
                value={block.projectId ?? ''}
                onChange={handleProjectChange}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-xs bg-surface-elevated border border-border rounded px-2 py-1 text-text-primary"
                aria-label="Project"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={block.workOrderId ?? ''}
                onChange={handleWorkOrderChange}
                onClick={(e) => e.stopPropagation()}
                disabled={!currentProject}
                className="flex-1 text-xs bg-surface-elevated border border-border rounded px-2 py-1 text-text-primary disabled:opacity-40"
                aria-label="Work order"
              >
                <option value="">No work order</option>
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>
                    {wo.code} — {wo.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

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
              onClick={triggerDelete}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </>
  )
}
