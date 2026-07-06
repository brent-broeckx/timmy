// src/renderer/src/components/Submit/SubmitPanel.tsx
// Submit flow UI: date range picker → progress + per-week confirmation → result.

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { ipc } from '../../ipc'
import { DateRangePicker } from './DateRangePicker'
import type { SubmitProgress, SubmitPrompt, SubmitResult } from '@shared/types'

type View = 'range' | 'running' | 'result'

export function SubmitPanel(): React.JSX.Element {
  const [view, setView] = useState<View>('range')
  const [progress, setProgress] = useState<SubmitProgress | null>(null)
  const [prompt, setPrompt] = useState<SubmitPrompt | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)

  // Subscribe to submit progress and per-week prompts
  useEffect(() => {
    const handleProgress = (p: SubmitProgress): void => {
      setProgress(p)
      if (p.status === 'complete' || p.status === 'cancelled' || p.status === 'error') {
        ipc.submit.getResult()
          .then((r) => { if (r) { setResult(r); setView('result') } })
          .catch(() => null)
      }
    }
    const handlePrompt = (p: SubmitPrompt): void => setPrompt(p)

    ipc.onSubmitProgress(handleProgress)
    ipc.onSubmitPrompt(handlePrompt)
    return () => {
      ipc.offSubmitProgress(handleProgress)
      ipc.offSubmitPrompt(handlePrompt)
    }
  }, [])

  // ── Range confirmed ─────────────────────────────────────────────────────────

  function handleRangeConfirmed(sd: string, ed: string): void {
    void startSubmit(sd, ed)
  }

  async function startSubmit(sd: string, ed: string): Promise<void> {
    setProgress({
      currentWeek: '',
      weekLabel: '',
      status: 'idle',
      message: 'Starting…',
      progress: 0,
      weeksTotal: 0,
      weeksDone: 0,
    })
    setPrompt(null)
    setResult(null)
    setView('running')

    try {
      await ipc.submit.start(sd, ed)
    } catch (e) {
      setProgress((prev) => ({
        ...(prev ?? { currentWeek: '', weekLabel: '', progress: 0, weeksTotal: 0, weeksDone: 0 }),
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      }))
    }
  }

  // ── Confirm / skip week ─────────────────────────────────────────────────────

  async function handleConfirm(confirmed: boolean): Promise<void> {
    if (!prompt) return
    await ipc.submit.confirmWeek(prompt.weekStart, confirmed).catch(() => null)
    setPrompt(null)
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────

  async function handleCancel(): Promise<void> {
    await ipc.submit.cancel().catch(() => null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-4 gap-5">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Send size={15} className="text-accent" />
        <span className="text-sm font-semibold text-text-primary">Auto Submit</span>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Range picker view ─────────────────────────────────────────────── */}
        {view === 'range' && (
          <motion.div
            key="range"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            <DateRangePicker onRangeConfirmed={handleRangeConfirmed} />
          </motion.div>
        )}

        {/* ── Running view ─────────────────────────────────────────────────── */}
        {view === 'running' && progress && (
          <motion.div
            key="running"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Progress bar */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  {progress.weekLabel ? `Week ${progress.weekLabel}` : 'Preparing…'}
                </span>
                <span className="text-xs text-text-muted">
                  {progress.weeksDone}/{progress.weeksTotal}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  animate={{ width: `${progress.progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="text-accent animate-spin flex-shrink-0" />
                <span className="text-xs text-text-muted">{progress.message}</span>
              </div>
            </div>

            {/* Week confirmation prompt */}
            <AnimatePresence>
              {prompt && (
                <motion.div
                  key="prompt"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col gap-3 p-3 rounded-lg bg-surface border border-border"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-accent flex-shrink-0" />
                    <span className="text-sm font-semibold text-text-primary">
                      Week {prompt.weekLabel} ready
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    {prompt.entries.length} entries filled in the browser. Review them, then confirm
                    to click Submit — or skip this week.
                  </p>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                    {prompt.entries.map((e, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-muted">{e.date}</span>
                        <span className="font-mono text-text-primary">{e.workOrderCode}</span>
                        <span className="text-accent font-semibold">{e.decimalHours}h</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirm(false)}
                      className="flex-1 py-1.5 rounded-md border border-border text-text-muted text-xs hover:text-text-primary transition-colors"
                    >
                      Skip week
                    </button>
                    <button
                      onClick={() => handleConfirm(true)}
                      className="flex-1 py-1.5 rounded-md bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
                    >
                      Submit week
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={handleCancel}
              className="w-full py-2 rounded-lg border border-border text-text-muted text-sm hover:text-text-primary hover:border-border-hover transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        )}

        {/* ── Result view ──────────────────────────────────────────────────── */}
        {view === 'result' && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col items-center gap-2 py-4">
              {result.success ? (
                <CheckCircle2 size={32} className="text-green-400" />
              ) : (
                <XCircle size={32} className="text-red-400" />
              )}
              <span className="text-sm font-semibold text-text-primary">
                {result.success ? 'Submit complete' : 'Submit finished with errors'}
              </span>
              <span className="text-xs text-text-muted text-center">
                {result.weeksSubmitted} week{result.weeksSubmitted !== 1 ? 's' : ''} submitted ·{' '}
                {result.entriesSubmitted} entries filled
              </span>
            </div>

            {result.errors.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto p-3 rounded-lg bg-red-950/20 border border-red-900/30">
                <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">
                  Warnings / skipped
                </span>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-text-muted">{e}</p>
                ))}
              </div>
            )}

            <button
              onClick={() => { setView('range'); setResult(null); setProgress(null) }}
              className="w-full py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
            >
              Submit another range
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
