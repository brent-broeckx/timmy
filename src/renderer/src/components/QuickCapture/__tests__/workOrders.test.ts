import { describe, expect, it } from 'vitest'
import { buildWorkOrderOptions, filterWorkOrderOptions, isExactWorkOrderMatch, resolveQuickCaptureWorkOrder } from '../workOrders'
import type { Project } from '@shared/types'

const projects: Project[] = [
  {
    id: 'project-a',
    name: 'Client Portal',
    clientName: 'Acme',
    active: true,
    workOrders: [
      {
        id: 'wo-a',
        projectId: 'project-a',
        code: 'WO-1001',
        label: 'Feature work',
        description: 'Portal delivery',
      },
      {
        id: 'wo-b',
        projectId: 'project-a',
        code: 'WO-1002',
        label: 'Support',
        description: 'Bug fixes',
      },
    ],
  },
  {
    id: 'project-b',
    name: 'Inactive Project',
    clientName: 'Legacy',
    active: false,
    workOrders: [
      {
        id: 'wo-c',
        projectId: 'project-b',
        code: 'WO-2001',
        label: 'Ignored',
        description: 'Should not appear',
      },
    ],
  },
]

describe('quick capture work order helpers', () => {
  it('builds options from active projects only', () => {
    const options = buildWorkOrderOptions(projects)

    expect(options.map((option) => option.workOrderId)).toEqual(['wo-a', 'wo-b'])
  })

  it('filters by code, label, and project name', () => {
    const options = buildWorkOrderOptions(projects)

    expect(filterWorkOrderOptions(options, '1002').map((option) => option.workOrderId)).toEqual(['wo-b'])
    expect(filterWorkOrderOptions(options, 'feature').map((option) => option.workOrderId)).toEqual(['wo-a'])
    expect(filterWorkOrderOptions(options, 'client portal').map((option) => option.workOrderId)).toEqual(['wo-a', 'wo-b'])
  })

  it('recognizes exact typed matches', () => {
    const option = buildWorkOrderOptions(projects)[0]

    expect(isExactWorkOrderMatch(option, 'WO-1001')).toBe(true)
    expect(isExactWorkOrderMatch(option, 'WO-1001 - Feature work')).toBe(true)
    expect(isExactWorkOrderMatch(option, 'portal')).toBe(false)
  })

  it('prefers remembered work order and otherwise auto-selects only a single available option', () => {
    expect(resolveQuickCaptureWorkOrder(projects, 'wo-b')?.workOrderId).toBe('wo-b')
    expect(resolveQuickCaptureWorkOrder(projects, 'wo-c')).toBeNull()
    expect(resolveQuickCaptureWorkOrder(projects, null)).toBeNull()

    const singleProject: Project[] = [
      {
        id: 'project-c',
        name: 'Single Project',
        clientName: 'Only One',
        active: true,
        workOrders: [
          {
            id: 'wo-single',
            projectId: 'project-c',
            code: 'WO-1',
            label: 'Only choice',
            description: '',
          },
        ],
      },
    ]

    expect(resolveQuickCaptureWorkOrder(singleProject, null)?.workOrderId).toBe('wo-single')
  })
})