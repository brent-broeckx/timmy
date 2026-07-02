import type { Project } from '@shared/types'

export type WorkOrderOption = {
  workOrderId: string
  projectId: string
  projectName: string
  code: string
  label: string
  description: string
  displayLabel: string
  searchValue: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildWorkOrderOptions(projects: Project[]): WorkOrderOption[] {
  return projects
    .filter((project) => project.active)
    .flatMap((project) => project.workOrders.map((workOrder) => ({
      workOrderId: workOrder.id,
      projectId: project.id,
      projectName: project.name,
      code: workOrder.code,
      label: workOrder.label,
      description: workOrder.description,
      displayLabel: `${workOrder.code} - ${workOrder.label}`,
      searchValue: normalize(
        [workOrder.code, workOrder.label, workOrder.description, project.name, project.clientName].join(' '),
      ),
    })))
}

export function filterWorkOrderOptions(options: WorkOrderOption[], query: string): WorkOrderOption[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return options

  const ranked = options
    .map((option) => {
      const code = normalize(option.code)
      const label = normalize(option.label)
      const display = normalize(option.displayLabel)
      const project = normalize(option.projectName)
      const startsWith = [code, label, display, project].some((value) => value.startsWith(normalizedQuery))
      const includes = option.searchValue.includes(normalizedQuery)
      if (!startsWith && !includes) return null
      return { option, rank: startsWith ? 0 : 1 }
    })
    .filter((entry): entry is { option: WorkOrderOption; rank: number } => entry !== null)

  return ranked
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      return a.option.displayLabel.localeCompare(b.option.displayLabel)
    })
    .map((entry) => entry.option)
}

export function isExactWorkOrderMatch(option: WorkOrderOption, query: string): boolean {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return false

  return [option.code, option.label, option.displayLabel]
    .map(normalize)
    .includes(normalizedQuery)
}

export function resolveQuickCaptureWorkOrder(
  projects: Project[],
  rememberedWorkOrderId: string | null,
): WorkOrderOption | null {
  const options = buildWorkOrderOptions(projects)

  if (rememberedWorkOrderId) {
    const remembered = options.find((option) => option.workOrderId === rememberedWorkOrderId)
    if (remembered) return remembered
  }

  return options.length === 1 ? options[0] : null
}