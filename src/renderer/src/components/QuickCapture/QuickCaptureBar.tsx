// src/renderer/src/components/QuickCapture/QuickCaptureBar.tsx
// Shown in the separate always-on-top quick-capture window.
// Supports: plain task entry, ghost-text autocomplete from recents, slash commands.

import { useEffect, useRef, useState } from 'react'
import { useTaskStore } from '../../store/useTaskStore'
import { ipc } from '../../ipc'
import { findSuggestion } from './suggestions'
import { filterCommands, resolveCommand, COMMANDS } from './commands'
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

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-transparent">
      <div className="w-full mx-4 flex flex-col gap-1.5">
        {/* Input card */}
        <div className="relative flex items-center gap-2 bg-surface-elevated border border-border rounded-xl px-4 shadow-2xl">
          <span className="text-accent text-base flex-shrink-0">
            {isSlashMode ? '/' : '▶'}
          </span>

          {/* Ghost-text layer (sits behind the real input) */}
          <div
            className="absolute left-0 pl-10 pr-4 text-sm text-text-muted pointer-events-none select-none whitespace-pre font-[inherit]"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
            aria-hidden
          >
            {value}
            <span className="opacity-40">{ghostSuffix}</span>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setHighlightedCmd(0) }}
            onKeyDown={handleKeyDown}
            placeholder={isSlashMode ? '' : 'What are you working on? (Enter to start, Esc to cancel)'}
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted text-sm py-4 outline-none relative z-10"
            autoComplete="off"
            spellCheck={false}
          />

          {value && !isSlashMode && (
            <kbd className="text-xs text-text-muted border border-border rounded px-1 py-0.5 flex-shrink-0">
              Enter
            </kbd>
          )}
        </div>

        {/* Ghost-text hint */}
        {suggestion && !isSlashMode && (
          <div className="px-4 text-xs text-text-muted">
            ↹ Tab to use: <span className="text-text-primary">{suggestion}</span>
          </div>
        )}

        {/* Slash command picker */}
        {isSlashMode && matchedCommands.length > 0 && (
          <div className="bg-surface-elevated border border-border rounded-xl overflow-hidden shadow-2xl">
            {matchedCommands.map((cmd, i) => (
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
          </div>
        )}

        {/* Show all commands hint when only '/' is typed */}
        {value === '/' && COMMANDS.length > 0 && matchedCommands.length === 0 && (
          <div className="bg-surface-elevated border border-border rounded-xl overflow-hidden shadow-2xl">
            {COMMANDS.map((cmd, i) => (
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
          </div>
        )}
      </div>
    </div>
  )
}
