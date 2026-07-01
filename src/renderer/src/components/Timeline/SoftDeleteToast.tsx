// src/renderer/src/components/Timeline/SoftDeleteToast.tsx
// 4-second countdown toast with an Undo button.
// The parent calls onConfirm after the timeout or onUndo when dismissed early.

import { useEffect, useRef, useState } from 'react'

type Props = {
  message: string
  onUndo: () => void
  onConfirm: () => void
}

const DURATION_MS = 4000

export function SoftDeleteToast({ message, onUndo, onConfirm }: Props): React.JSX.Element {
  const [remaining, setRemaining] = useState(DURATION_MS)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const start = Date.now()

    confirmTimerRef.current = setTimeout(() => {
      clearInterval(tickTimerRef.current!)
      onConfirm()
    }, DURATION_MS)

    tickTimerRef.current = setInterval(() => {
      setRemaining(Math.max(0, DURATION_MS - (Date.now() - start)))
    }, 100)

    return () => {
      clearTimeout(confirmTimerRef.current!)
      clearInterval(tickTimerRef.current!)
    }
  }, [])

  const handleUndo = (): void => {
    clearTimeout(confirmTimerRef.current!)
    clearInterval(tickTimerRef.current!)
    onUndo()
  }

  const progress = (remaining / DURATION_MS) * 100

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface-elevated border border-border rounded-lg px-4 py-2 shadow-xl text-sm">
      <span className="text-text-muted">{message}</span>
      <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-none rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <button
        onClick={handleUndo}
        className="text-accent font-medium hover:underline"
      >
        Undo
      </button>
    </div>
  )
}
