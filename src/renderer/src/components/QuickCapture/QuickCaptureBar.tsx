// src/renderer/src/components/QuickCapture/QuickCaptureBar.tsx
// Shown in the separate always-on-top quick-capture window.
// Supports: plain task entry, ghost-text autocomplete from recents, slash commands.

import { useEffect, useRef, useState } from 'react'
import { useTaskStore } from '../../store/useTaskStore'
import { ipc } from '../../ipc'
import { findSuggestion } from './suggestions'
import { filterCommands, resolveCommand } from './commands'
import type { SlashCommand } from './commands'

export function QuickCaptureBar(): React.JSX.Element {
  const [value, setValue] = useState('')
  const [highlightedCmd, setHighlightedCmd] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const startTask = useTaskStore((s) => s.startTask)
  const recentTasks = useTaskStore((s) => s.recentTasks)
  const loadRecent = useTaskStore((s) => s.loadRecent)

  useEffect(() => {
    loadRecent()
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = (): void => {
    setValue('')
    setHighlightedCmd(0)
    ipc.window.hideQuickCapture()
  }

  const suggestion = findSuggestion(value, recentTasks)
  const matchedCommands = filterCommands(value)
  const isSlashMode = value.startsWith('/')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (isSlashMode && matchedCommands.length > 0) {
        // First Escape clears the slash input, second dismisses
        setValue('')
      } else {
        dismiss()
      }
      return
    }

    // Navigate command list
    if (isSlashMode && matchedCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedCmd((i) => Math.min(i + 1, matchedCommands.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedCmd((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const cmd = matchedCommands[highlightedCmd]
        if (cmd) setValue(`/${cmd.name} `)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const resolved = resolveCommand(value)
        if (resolved) {
          resolved.command.execute(resolved.arg, {
            taskStore: useTaskStore.getState(),
            dismiss,
            setValue,
            recentTasks,
          })
        }
        return
      }
    }

    // Accept ghost-text suggestion with Tab
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault()
      setValue(suggestion)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const title = value.trim()
      if (!title || title === '/') return
      startTask(title)
      dismiss()
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
        recentTasks,
      })
    }
  }

  // Ghost suffix — the part after what the user has typed
  const ghostSuffix = suggestion ? suggestion.slice(value.length) : ''

  const MAX_VISIBLE_COMMANDS = 5
  const commandsToShow = isSlashMode ? matchedCommands.slice(0, MAX_VISIBLE_COMMANDS) : []
  const hiddenCount = isSlashMode ? matchedCommands.length - commandsToShow.length : 0

  return (
    <div className="w-full h-full flex flex-col bg-transparent pt-4 px-4">
      <div className="flex flex-col gap-1.5">
        {/* Input card */}
        <div className="flex items-center gap-2 bg-surface-elevated border border-border rounded-xl px-4 shadow-2xl">
          <span className="text-accent text-base shrink-0 pointer-events-none select-none">▶</span>

          {/* Input wrapper: ghost text sits behind a transparent input */}
          <div className="relative flex-1">
            <div
              className="absolute inset-0 flex items-center pointer-events-none select-none overflow-hidden"
              aria-hidden
            >
              <span className="text-sm text-text-primary whitespace-pre">{value}</span>
              <span className="text-sm text-text-muted opacity-50 whitespace-pre">{ghostSuffix}</span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setHighlightedCmd(0) }}
              onKeyDown={handleKeyDown}
              placeholder="What are you working on?"
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
        {suggestion && !isSlashMode && (
          <div className="px-4 text-xs text-text-muted">
            ↹ Tab to complete
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
                    : 'text-text-muted hover:bg-white/5 hover:text-text-primary',
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
      </div>
    </div>
  )
}
