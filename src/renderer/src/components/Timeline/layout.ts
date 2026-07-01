// src/renderer/src/components/Timeline/layout.ts
// Computes side-by-side column layout for overlapping time blocks.
// Pure function — no side effects, no store access.

import type { TimeBlock } from '@shared/types'

// Use a far-future sentinel for running blocks (endTime === null).
// A real `new Date()` would cause layout to shift every second as the timer ticks.
const FAR_FUTURE = '9999-12-31T23:59:59.000Z'

// ── Visual-minute bucket helpers ───────────────────────────────────────────────
// DayView renders with minute-level resolution (blockY uses getHours/getMinutes).
// Two blocks that start/end in the same minute need to be detected as visually
// overlapping even when their exact timestamps don't overlap.
// Solution: floor start times and CEIL end times to whole minutes before comparing.
function bucketStart(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000
}
function bucketEnd(ms: number): number {
  return Math.ceil(ms / 60_000) * 60_000
}

export type LayoutBlock = TimeBlock & {
  columnIndex: number
  totalColumns: number
}

/**
 * Annotate each block with columnIndex and totalColumns for side-by-side rendering.
 * Uses an interval graph coloring approach: blocks are sorted by start time, then
 * each block is assigned the lowest column not occupied by an overlapping block.
 */
export function computeLayout(blocks: TimeBlock[]): LayoutBlock[] {
  if (blocks.length === 0) return []

  // Sort ascending by start time
  const sorted = [...blocks].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  // columnEndTimes[col] = bucketed endTime of the last block assigned to that column
  const columnEnd: number[] = []

  // col assignment per block (by index in `sorted`)
  const assignments: number[] = []

  for (const block of sorted) {
    const startMs = new Date(block.startTime).getTime()
    const endMs = new Date(block.endTime ?? FAR_FUTURE).getTime()
    const bs = bucketStart(startMs)
    const be = bucketEnd(endMs)

    // A column is free when its bucketed end is ≤ the bucketed start of the new block.
    // Using bucketed values means two blocks that share even part of the same minute
    // are treated as overlapping and placed in different columns.
    let col = columnEnd.findIndex((e) => e <= bs)
    if (col === -1) {
      col = columnEnd.length
    }

    columnEnd[col] = be
    assignments.push(col)
  }

  // Compute `totalColumns` per overlap group:
  // For each block, total = max column index among all blocks that visually overlap, + 1
  const result: LayoutBlock[] = sorted.map((block, i) => {
    const startMs = new Date(block.startTime).getTime()
    const endMs = new Date(block.endTime ?? FAR_FUTURE).getTime()
    const bs = bucketStart(startMs)
    const be = bucketEnd(endMs)
    const myCol = assignments[i]

    let maxCol = myCol
    for (let j = 0; j < sorted.length; j++) {
      if (j === i) continue
      const sj = bucketStart(new Date(sorted[j].startTime).getTime())
      const ej = bucketEnd(new Date(sorted[j].endTime ?? FAR_FUTURE).getTime())
      // Half-open interval overlap on bucketed times
      if (bs < ej && sj < be) {
        maxCol = Math.max(maxCol, assignments[j])
      }
    }

    return {
      ...block,
      columnIndex: myCol,
      totalColumns: maxCol + 1,
    }
  })

  // Re-sort into original order (by id) so Timeline render order is preserved
  const idOrder = new Map(blocks.map((b, i) => [b.id, i]))
  return result.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
}

/**
 * Group layout blocks into arrays of overlapping blocks for flex-row rendering.
 * Non-overlapping blocks appear in their own single-element groups.
 *
 * Uses the actual current time for running blocks (endTime === null) so that
 * a block started hours ago doesn't pull every subsequent block into its group.
 * (computeLayout uses FAR_FUTURE for stable column assignment — this is intentionally different.)
 */
export function groupByOverlap(layoutBlocks: LayoutBlock[]): LayoutBlock[][] {
  if (layoutBlocks.length === 0) return []

  const now = Date.now()
  const sorted = [...layoutBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const groups: LayoutBlock[][] = []
  let group: LayoutBlock[] = []
  let groupMaxEnd = 0

  for (const block of sorted) {
    const start = new Date(block.startTime).getTime()
    // Running blocks end "now" for overlap detection — not in year 9999
    const end = block.endTime ? new Date(block.endTime).getTime() : now
    if (group.length === 0 || start < groupMaxEnd) {
      group.push(block)
      groupMaxEnd = Math.max(groupMaxEnd, end)
    } else {
      groups.push(group)
      group = [block]
      groupMaxEnd = end
    }
  }
  if (group.length > 0) groups.push(group)
  return groups
}

