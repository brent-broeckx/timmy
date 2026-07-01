// src/renderer/src/components/QuickCapture/QuickCaptureBar.tsx
// Shown in the separate always-on-top quick-capture window.
// Enter = start task, Escape = dismiss.

import { useEffect, useRef, useState } from 'react'
import { useTaskStore } from '../../store/useTaskStore'
import { ipc } from '../../ipc'

export function QuickCaptureBar(): React.JSX.Element {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const startTask = useTaskStore((s) => s.startTask)

  useEffect(() => {
    // Auto-focus whenever the window becomes visible
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = (): void => {
    setValue('')
    ipc.window.hideQuickCapture()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      dismiss()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const title = value.trim()
      if (!title) return
      startTask(title)
      dismiss()
    }
  }

  return (
    // Full-window transparent container; the bar is the centred card
    <div className="w-full h-full flex items-center justify-center bg-transparent">
      <div className="w-full mx-4 flex items-center gap-2 bg-surface-elevated border border-border rounded-xl px-4 shadow-2xl">
        <span className="text-accent text-base flex-shrink-0">▶</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What are you working on? (Enter to start, Esc to cancel)"
          className="flex-1 bg-transparent text-text-primary placeholder-text-muted text-sm py-4 outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {value && (
          <kbd className="text-xs text-text-muted border border-border rounded px-1 py-0.5 flex-shrink-0">
            Enter
          </kbd>
        )}
      </div>
    </div>
  )
}
