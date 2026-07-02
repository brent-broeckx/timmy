// src/renderer/src/components/QuickCapture/QuickCaptureBar.tsx
// Shown in the separate always-on-top quick-capture window.
// Supports: plain task entry, ghost-text autocomplete from recents, slash commands.

import { useEffect, useRef, useState } from 'react'
import { useTaskStore } from '../../store/useTaskStore'
import { useConfigStore } from '../../store/useConfigStore'
import { useTimelineStore } from '../../store/useTimelineStore'
import { ipc } from '../../ipc'
import { filterCommands, resolveCommand } from './commands'
import type { SlashCommand } from './commands'
import type { TimeBlock } from '@shared/types'
import {
  filterWorkOrderOptions,
  isExactWorkOrderMatch,
  resolveQuickCaptureWorkOrder,
  buildWorkOrderOptions,
  type WorkOrderOption,
} from './workOrders'

function computeGhost(
  value: string,
  recents: string[],
  matchedCommands: SlashCommand[],
  highlightedIdx: number
): { ghostSuffix: string; ghostAcceptValue: string | null; matchCount: number } {
  if (value.startsWith('/')) {
    const resolved = resolveCommand(value)
    if (resolved?.command.name === 'wo') {
      const typedName = value.slice(1).split(' ')[0].toLowerCase()
      const topCmd = matchedCommands[highlightedIdx] ?? matchedCommands[0]
      if (topCmd && typedName.length < topCmd.name.length) {
        return {
          ghostSuffix: topCmd.name.slice(typedName.length),
          ghostAcceptValue: `/${topCmd.name} `,
          matchCount: 0,
        }
      }
      return { ghostSuffix: '', ghostAcceptValue: null, matchCount: 0 }
    }
    if (resolved?.command.name === 'reuse' && resolved.arg) {
      const argLower = resolved.arg.toLowerCase()
      const allMatches = recents.filter((r) => r.toLowerCase().startsWith(argLower))
      const match = allMatches[0]
      if (match && match.length > resolved.arg.length) {
        return {
          ghostSuffix: match.slice(resolved.arg.length),
          ghostAcceptValue: `/reuse ${match}`,
          matchCount: allMatches.length
        }
      }
      return { ghostSuffix: '', ghostAcceptValue: null, matchCount: allMatches.length }
    }
    const typedName = value.slice(1).split(' ')[0].toLowerCase()
    const topCmd = matchedCommands[highlightedIdx] ?? matchedCommands[0]
    if (topCmd && typedName.length < topCmd.name.length) {
      return {
        ghostSuffix: topCmd.name.slice(typedName.length),
        ghostAcceptValue: `/${topCmd.name} `,
        matchCount: 0
      }
    }
    return { ghostSuffix: '', ghostAcceptValue: null, matchCount: 0 }
  }
  if (!value) return { ghostSuffix: '', ghostAcceptValue: null, matchCount: 0 }
  const lower = value.toLowerCase()
  const allMatches = recents.filter((r) => r.toLowerCase().startsWith(lower))
  const suggestion = allMatches[0] ?? null
  if (suggestion) {
    return {
      ghostSuffix: suggestion.slice(value.length),
      ghostAcceptValue: suggestion,
      matchCount: allMatches.length
    }
  }
  return { ghostSuffix: '', ghostAcceptValue: null, matchCount: 0 }
}

export function QuickCaptureBar(): React.JSX.Element {
  const [value, setValue] = useState('')
  const [highlightedCmd, setHighlightedCmd] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const startTask = useTaskStore((s) => s.startTask)
  const recentTasks = useTaskStore((s) => s.recentTasks)
  const loadRecent = useTaskStore((s) => s.loadRecent)
  const loadConfig = useConfigStore((s) => s.load)
  const updateConfig = useConfigStore((s) => s.updateConfig)
  const projects = useConfigStore((s) => s.projects)
  const rememberedWorkOrderId = useConfigStore((s) => s.config.quickCaptureWorkOrderId)
  const loadDay = useTimelineStore((s) => s.loadDay)

  useEffect(() => {
    const refreshQuickCaptureState = async (): Promise<void> => {
      const today = new Date().toISOString().split('T')[0]

      await loadConfig()
      await loadRecent()
      await loadDay(today)

      const runningTask = useTimelineStore.getState().blocks.find((block) => block.endTime === null) ?? null
      useTaskStore.setState({ currentTask: runningTask })

      const { config, projects: currentProjects } = useConfigStore.getState()
      const activeSelection = resolveQuickCaptureWorkOrder(currentProjects, config.quickCaptureWorkOrderId)
      if (config.quickCaptureWorkOrderId && !activeSelection) {
        await updateConfig({ quickCaptureWorkOrderId: null })
      }
    }

    void refreshQuickCaptureState()

    const handleTaskChanged = (block: TimeBlock): void => {
      useTimelineStore.getState().syncBlockLocal(block)
      if (!block.deleted && block.endTime === null) {
        useTaskStore.setState({ currentTask: block })
        return
      }

      if (useTaskStore.getState().currentTask?.id === block.id) {
        useTaskStore.setState({ currentTask: null })
      }
    }

    const handleFocus = (): void => {
      void refreshQuickCaptureState()
    }

    const handleProjectsChanged = (): void => {
      void refreshQuickCaptureState()
    }

    ipc.onTaskChanged(handleTaskChanged)
    ipc.onProjectsChanged(handleProjectsChanged)
    window.addEventListener('focus', handleFocus)
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => {
      clearTimeout(timer)
      ipc.offTaskChanged(handleTaskChanged)
      ipc.offProjectsChanged(handleProjectsChanged)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loadConfig, loadDay, loadRecent, updateConfig])

  const dismiss = (): void => {
    setValue('')
    setHighlightedCmd(0)
    ipc.window.hideQuickCapture()
  }

  const matchedCommands = filterCommands(value)
  const isSlashMode = value.startsWith('/')
  const resolvedCommand = resolveCommand(value)
  const isWorkOrderMode = resolvedCommand?.command.name === 'wo'
  const workOrderOptions = buildWorkOrderOptions(projects)
  const matchedWorkOrders = isWorkOrderMode
    ? filterWorkOrderOptions(workOrderOptions, resolvedCommand.arg)
    : []
  const activeWorkOrder = resolveQuickCaptureWorkOrder(projects, rememberedWorkOrderId)
  const { ghostSuffix, ghostAcceptValue, matchCount } = computeGhost(
    value,
    recentTasks,
    matchedCommands,
    highlightedCmd
  )

  const selectWorkOrder = async (option: WorkOrderOption): Promise<void> => {
    setHighlightedCmd(0)
    setValue('')
    await updateConfig({ quickCaptureWorkOrderId: option.workOrderId })
    inputRef.current?.focus()
  }

  const navigateSlash = (key: string): boolean => {
    const optionCount = isWorkOrderMode ? matchedWorkOrders.length : matchedCommands.length

    if (key === 'ArrowDown') {
      setHighlightedCmd((i) => Math.min(i + 1, optionCount - 1))
      return true
    }
    if (key === 'ArrowUp') {
      setHighlightedCmd((i) => Math.max(i - 1, 0))
      return true
    }
    if (isWorkOrderMode && key === 'Enter') {
      const query = resolvedCommand?.arg.trim() ?? ''
      if (!query) return true

      const selected = matchedWorkOrders.find((option) => isExactWorkOrderMatch(option, query))
        ?? matchedWorkOrders[highlightedCmd]
        ?? matchedWorkOrders[0]

      if (selected) {
        void selectWorkOrder(selected)
      }
      return true
    }
    if (key === 'Enter') {
      const resolved = resolveCommand(value)
      resolved?.command.execute(resolved.arg, {
        taskStore: useTaskStore.getState(),
        dismiss,
        setValue,
        enterWorkOrderMode: () => setValue('/wo '),
        recentTasks
      })
      return true
    }
    return false
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (isSlashMode && (matchedCommands.length > 0 || matchedWorkOrders.length > 0)) {
        setValue('')
        return
      }
      dismiss()
      return
    }
    if (isWorkOrderMode && e.key === 'Tab' && matchedWorkOrders.length > 0) {
      e.preventDefault()
      void selectWorkOrder(matchedWorkOrders[highlightedCmd] ?? matchedWorkOrders[0])
      return
    }
    if (e.key === 'Tab' && ghostAcceptValue) {
      e.preventDefault()
      setValue(ghostAcceptValue)
      return
    }
    if (isSlashMode && (matchedCommands.length > 0 || matchedWorkOrders.length > 0) && navigateSlash(e.key)) {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const title = value.trim()
      if (title && title !== '/') {
        void startTask(title, activeWorkOrder
          ? { projectId: activeWorkOrder.projectId, workOrderId: activeWorkOrder.workOrderId }
          : undefined,
        ).then(dismiss)
      }
    }
  }

  const handleCommandClick = (cmd: SlashCommand): void => {
    if (cmd.takesArg) {
      setValue(`/${cmd.name} `)
      inputRef.current?.focus()
    } else {
      cmd.execute('', {
        taskStore: useTaskStore.getState(),
        dismiss,
        setValue,
        enterWorkOrderMode: () => setValue('/wo '),
        recentTasks
      })
    }
  }

  const MAX_VISIBLE_COMMANDS = 5
  const commandsToShow = isSlashMode && !isWorkOrderMode ? matchedCommands.slice(0, MAX_VISIBLE_COMMANDS) : []
  const workOrdersToShow = isWorkOrderMode ? matchedWorkOrders.slice(0, MAX_VISIBLE_COMMANDS) : []
  const hiddenCount = isSlashMode ? matchedCommands.length - commandsToShow.length : 0
  const hiddenWorkOrderCount = isWorkOrderMode ? matchedWorkOrders.length - workOrdersToShow.length : 0

  return (
    <div className="w-full h-full flex flex-col bg-transparent pt-4 px-4">
      <div className="flex flex-col gap-1.5">
        {/* Input card */}
        <div className="flex items-center gap-2 bg-surface-elevated border border-border rounded-xl px-4 shadow-2xl">
          <span className="text-accent text-base shrink-0 pointer-events-none select-none">▶</span>

          {activeWorkOrder && !isWorkOrderMode && (
            <div className="shrink-0 max-w-[220px] rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent/80">WO</span>
                <span className="truncate text-xs font-medium text-text-primary">{activeWorkOrder.code}</span>
              </div>
              <p className="truncate text-[11px] text-text-muted">{activeWorkOrder.projectName}</p>
            </div>
          )}

          {/* Input wrapper: ghost text sits behind a transparent input */}
          <div className="relative flex-1">
            <div
              className="absolute inset-0 flex items-center pointer-events-none select-none overflow-hidden"
              aria-hidden
            >
              <span className="text-sm text-text-primary whitespace-pre">{value}</span>
              <span className="text-sm text-text-muted opacity-50 whitespace-pre">
                {ghostSuffix}
              </span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setHighlightedCmd(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder={isWorkOrderMode ? 'Filter work orders…' : 'What are you working on?'}
              className="relative w-full bg-transparent text-transparent placeholder-text-muted text-sm py-4 outline-none"
              style={{ caretColor: 'var(--color-text-primary)' }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {value && !isSlashMode && (
            <kbd className="text-xs text-text-muted border border-border rounded px-1 py-0.5 shrink-0">
              Enter
            </kbd>
          )}
        </div>

        {/* Tab-to-complete hint */}
        {ghostSuffix && (
          <div className="px-4 text-xs text-text-muted flex items-center gap-2">
            <span>↹ Tab to complete</span>
            {matchCount > 1 && (
              <span className="opacity-60">
                · {matchCount - 1} more match{matchCount > 2 ? 'es' : ''}
              </span>
            )}
          </div>
        )}

        {activeWorkOrder && !isWorkOrderMode && (
          <div className="px-4 text-xs text-text-muted flex items-center gap-2">
            <span>Using {activeWorkOrder.displayLabel}</span>
            <span className="opacity-60">· type /wo to change it</span>
          </div>
        )}

        {/* Slash command picker */}
        {commandsToShow.length > 0 && (
          <div className="bg-surface-elevated border border-border rounded-xl overflow-hidden shadow-2xl">
            {commandsToShow.map((cmd, i) => (
              <button
                key={cmd.name}
                onClick={() => handleCommandClick(cmd)}
                className={[
                  'w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                  i === highlightedCmd
                    ? 'bg-accent/10 text-text-primary'
                    : 'text-text-muted hover:bg-white/5 hover:text-text-primary'
                ].join(' ')}
              >
                <span className="font-mono text-accent">/{cmd.name}</span>
                <span className="text-xs">{cmd.description}</span>
              </button>
            ))}
            {hiddenCount > 0 && (
              <div className="px-4 py-1.5 text-xs text-text-muted border-t border-white/10">
                +{hiddenCount} more — keep typing to filter
              </div>
            )}
          </div>
        )}

        {workOrdersToShow.length > 0 && (
          <div className="bg-surface-elevated border border-border rounded-xl overflow-hidden shadow-2xl">
            {workOrdersToShow.map((option, i) => (
              <button
                key={option.workOrderId}
                onClick={() => {
                  void selectWorkOrder(option)
                }}
                className={[
                  'w-full flex items-start gap-3 px-4 py-2 text-left text-sm transition-colors',
                  i === highlightedCmd
                    ? 'bg-accent/10 text-text-primary'
                    : 'text-text-muted hover:bg-white/5 hover:text-text-primary'
                ].join(' ')}
              >
                <span className="font-mono text-accent shrink-0">{option.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-text-primary">{option.label}</span>
                  <span className="block truncate text-[11px] text-text-muted">{option.projectName}</span>
                </span>
              </button>
            ))}
            {hiddenWorkOrderCount > 0 && (
              <div className="px-4 py-1.5 text-xs text-text-muted border-t border-white/10">
                +{hiddenWorkOrderCount} more work orders — keep typing to filter
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
