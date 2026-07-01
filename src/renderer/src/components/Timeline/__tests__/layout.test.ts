// src/renderer/src/components/Timeline/__tests__/layout.test.ts
import { describe, it, expect } from 'vitest'
import { computeLayout } from '../layout'
import type { TimeBlock } from '@shared/types'

function makeBlock(id: string, startHour: number, endHour: number | null): TimeBlock {
  const date = '2024-01-15'
  const start = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00Z`).toISOString()
  const end = endHour !== null
    ? new Date(`${date}T${String(endHour).padStart(2, '0')}:00:00Z`).toISOString()
    : null
  const minutes = endHour !== null ? (endHour - startHour) * 60 : null
  return {
    id,
    date,
    startTime: start,
    endTime: end,
    title: `Task ${id}`,
    notes: null,
    projectId: null,
    workOrderId: null,
    source: 'manual',
    sourceId: null,
    durationMinutes: minutes,
    decimalHours: minutes !== null ? minutes / 60 : null,
    deleted: false,
    createdAt: start,
    updatedAt: start,
  }
}

describe('computeLayout', () => {
  it('returns empty array for empty input', () => {
    expect(computeLayout([])).toEqual([])
  })

  it('assigns totalColumns=1 to a single block (no-op case)', () => {
    const result = computeLayout([makeBlock('a', 9, 10)])
    expect(result).toHaveLength(1)
    expect(result[0].columnIndex).toBe(0)
    expect(result[0].totalColumns).toBe(1)
  })

  it('assigns totalColumns=1 to sequential non-overlapping blocks', () => {
    const result = computeLayout([
      makeBlock('a', 9, 10),
      makeBlock('b', 10, 11),
      makeBlock('c', 11, 12),
    ])
    expect(result.every((r) => r.totalColumns === 1)).toBe(true)
    expect(result.every((r) => r.columnIndex === 0)).toBe(true)
  })

  it('assigns columnIndex 0 and 1 to two overlapping blocks', () => {
    const result = computeLayout([
      makeBlock('a', 9, 11),
      makeBlock('b', 10, 12),
    ])
    expect(result).toHaveLength(2)
    const cols = new Set(result.map((r) => r.columnIndex))
    expect(cols).toEqual(new Set([0, 1]))
    expect(result.every((r) => r.totalColumns === 2)).toBe(true)
  })

  it('assigns three columns to three mutually overlapping blocks', () => {
    const result = computeLayout([
      makeBlock('a', 9, 12),
      makeBlock('b', 9, 12),
      makeBlock('c', 9, 12),
    ])
    expect(result).toHaveLength(3)
    const cols = new Set(result.map((r) => r.columnIndex))
    expect(cols).toEqual(new Set([0, 1, 2]))
    expect(result.every((r) => r.totalColumns === 3)).toBe(true)
  })

  it('detects full overlap (identical start and end times)', () => {
    const blocks = [
      makeBlock('a', 9, 10),
      makeBlock('b', 9, 10),
    ]
    const result = computeLayout(blocks)
    // Both have totalColumns=2 so the Timeline can show the ⚠ badge
    expect(result.every((r) => r.totalColumns === 2)).toBe(true)
    const blockA = result.find((r) => r.id === 'a')!
    const blockB = result.find((r) => r.id === 'b')!
    // Their startTime and endTime are equal — full overlap
    expect(blockA.startTime).toBe(blockB.startTime)
    expect(blockA.endTime).toBe(blockB.endTime)
  })

  it('reuses a column after a non-overlapping block ends', () => {
    // a: 9-10, b: 9-10 (overlap → cols 0 & 1), c: 10-11 (no overlap with anything → col 0)
    const result = computeLayout([
      makeBlock('a', 9, 10),
      makeBlock('b', 9, 10),
      makeBlock('c', 10, 11),
    ])
    const blockC = result.find((r) => r.id === 'c')!
    expect(blockC.columnIndex).toBe(0)
    expect(blockC.totalColumns).toBe(1)
  })

  it('preserves original block order in returned array', () => {
    const input = [makeBlock('z', 11, 12), makeBlock('a', 9, 10), makeBlock('m', 10, 11)]
    const result = computeLayout(input)
    expect(result.map((r) => r.id)).toEqual(['z', 'a', 'm'])
  })
})
