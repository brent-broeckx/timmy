// src/renderer/src/components/Settings/CalendarSettings.tsx
// Manual Outlook calendar CSV import.

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react'
import { ipc } from '../../ipc'
import type { CalendarImportResult } from '@shared/types'

type ImportPhase = 'idle' | 'reading' | 'saving' | 'done'

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'))
    reader.readAsText(file)
  })
}

function resultMessage(result: CalendarImportResult): string {
  if (result.found === 0) return 'No calendar rows were found in this export.'
  if (result.imported === 0 && result.updated === 0 && result.allDay === 0) {
    return 'Everything in this export was already known to Timmy.'
  }
  return 'Your Outlook export has been folded into the local timeline.'
}

export function CalendarSettings(): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [phase, setPhase] = useState<ImportPhase>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<CalendarImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const busy = phase === 'reading' || phase === 'saving'

  async function importFile(file: File): Promise<void> {
    setError(null)
    setResult(null)
    setFileName(file.name)

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setPhase('idle')
      setError('Choose a .csv export from Outlook or Power Automate.')
      return
    }

    try {
      setPhase('reading')
      const csvText = await readFileText(file)
      setPhase('saving')
      const importResult = await ipc.calendar.importCsv(csvText)
      setResult(importResult)
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleFiles(files: FileList | null): void {
    const file = files?.[0]
    if (!file || busy) return
    void importFile(file)
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Outlook Calendar Import</h2>
          <p className="mt-1 text-xs text-text-muted max-w-xl leading-relaxed">
            Drop the CSV export from your Power Automate flow. Timmy uses Outlook event IDs to
            update repeats and avoid duplicate timeline blocks.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">
          <CalendarDays size={14} />
          Local import
        </div>
      </div>

      <motion.button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault()
          setDragActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          handleFiles(event.dataTransfer.files)
        }}
        animate={{
          borderColor: dragActive ? 'rgba(14, 165, 233, 0.75)' : 'rgba(255, 255, 255, 0.12)',
          background: dragActive ? 'rgba(14, 165, 233, 0.14)' : 'rgba(255, 255, 255, 0.045)'
        }}
        transition={{ duration: 0.16 }}
        className="relative w-full min-h-64 overflow-hidden rounded-xl border border-dashed p-6 text-left disabled:cursor-wait"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(148,163,184,0.08),transparent_28%)]" />
        <div className="relative flex h-full min-h-52 flex-col items-center justify-center gap-4 text-center">
          <motion.div
            animate={{ y: busy ? [0, -5, 0] : 0, scale: dragActive ? 1.06 : 1 }}
            transition={{ duration: 0.9, repeat: busy ? Infinity : 0, ease: 'easeInOut' }}
            className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/25 bg-accent/15 text-accent shadow-[0_0_36px_rgba(14,165,233,0.18)]"
          >
            {busy ? <Loader2 size={27} className="animate-spin" /> : <Upload size={28} />}
          </motion.div>

          <div className="space-y-1.5">
            <p className="text-base font-semibold text-text-primary">
              {busy ? 'Reading Outlook export' : 'Drop CSV here or click to choose'}
            </p>
            <p className="text-xs text-text-muted">
              Required columns: eventTitle, startTime, endTime, location, isAllDay, eventId
            </p>
          </div>

          <AnimatePresence mode="popLayout">
            {phase !== 'idle' && (
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-text-muted"
              >
                {phase === 'reading' && <FileSpreadsheet size={14} className="text-accent" />}
                {phase === 'saving' && <Loader2 size={14} className="animate-spin text-accent" />}
                {phase === 'done' && <CheckCircle2 size={14} className="text-green-400" />}
                <span>
                  {phase === 'reading' && `Parsing ${fileName ?? 'CSV'}...`}
                  {phase === 'saving' && 'Saving blocks locally...'}
                  {phase === 'done' && 'Import complete'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </motion.button>

      <AnimatePresence mode="popLayout">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            <XCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-white/10 bg-white/[0.045] p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-text-primary">{resultMessage(result)}</p>
                {fileName && <p className="mt-1 text-xs text-text-muted">{fileName}</p>}
              </div>
              <CheckCircle2 size={18} className="flex-shrink-0 text-green-400" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ['Rows', result.found],
                ['Added', result.imported],
                ['Updated', result.updated],
                ['Known', result.skipped],
                ['All-day', result.allDay]
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-white/10 bg-black/15 px-3 py-2"
                >
                  <p className="text-[11px] text-text-muted">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
                </div>
              ))}
            </div>

            {result.errors.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <p className="font-medium">Some rows were skipped:</p>
                <ul className="mt-1 space-y-1">
                  {result.errors.slice(0, 4).map((rowError) => (
                    <li key={rowError}>{rowError}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
