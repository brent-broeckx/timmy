// src/renderer/src/components/Settings/AppearanceSettings.tsx
// Glass intensity, theme, anchor corner, and anchor display mode settings.

import { useConfigStore } from '../../store/useConfigStore'
import { ipc } from '../../ipc'
import type { AppConfig } from '@shared/types'

type Corner = AppConfig['anchorPosition']
type Mode = AppConfig['anchorMode']

const CORNERS: { value: Corner; label: string }[] = [
  { value: 'TL', label: '↖ Top left' },
  { value: 'TR', label: '↗ Top right' },
  { value: 'BL', label: '↙ Bottom left' },
  { value: 'BR', label: '↘ Bottom right' },
]

const MODES: { value: Mode; label: string; description: string }[] = [
  { value: 'full', label: 'Full', description: 'Task name + elapsed time' },
  { value: 'dot-only', label: 'Dot only', description: 'Minimal pulsing indicator' },
  { value: 'hidden', label: 'Hidden', description: 'Tray icon only' },
]

export function AppearanceSettings(): React.JSX.Element {
  const config = useConfigStore((s) => s.config)
  const updateConfig = useConfigStore((s) => s.updateConfig)

  const handleGlassChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    updateConfig({ glassIntensity: Number(e.target.value) })
  }

  const handleTheme = (theme: AppConfig['theme']): void => {
    updateConfig({ theme })
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('timmy-theme', theme) } catch { /* ignore */ }
  }

  const handleCorner = (corner: Corner): void => {
    updateConfig({ anchorPosition: corner })
    ipc.window.repositionAnchor()
  }

  const handleMode = (mode: Mode): void => {
    updateConfig({ anchorMode: mode })
    if (mode === 'hidden') {
      ipc.window.hideAnchor()
    } else {
      ipc.window.repositionAnchor()
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <h2 className="text-sm font-semibold text-text-primary">Appearance</h2>

      {/* Glass intensity */}
      <div>
        <label className="text-xs text-text-muted block mb-2">
          Glass intensity — {config.glassIntensity}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={config.glassIntensity}
          onChange={handleGlassChange}
          className="w-full"
          aria-label="Glass intensity"
        />
        <div className="flex justify-between text-xs text-text-muted mt-1">
          <span>Opaque</span>
          <span>Transparent</span>
        </div>
      </div>

      {/* Theme */}
      <div>
        <p className="text-xs text-text-muted mb-2">Theme</p>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTheme(t)}
              className={[
                'flex-1 py-1.5 rounded text-xs border transition-colors capitalize',
                config.theme === t
                  ? 'bg-accent border-accent text-white'
                  : 'border-border text-text-muted hover:border-border-hover hover:text-text-primary',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Anchor corner */}
      <div>
        <p className="text-xs text-text-muted mb-2">Anchor position</p>
        <div className="grid grid-cols-2 gap-2">
          {CORNERS.map((c) => (
            <button
              key={c.value}
              onClick={() => handleCorner(c.value)}
              className={[
                'py-1.5 rounded text-xs border transition-colors',
                config.anchorPosition === c.value
                  ? 'bg-accent border-accent text-white'
                  : 'border-border text-text-muted hover:border-border-hover hover:text-text-primary',
              ].join(' ')}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Anchor display mode */}
      <div>
        <p className="text-xs text-text-muted mb-2">Anchor display</p>
        <div className="space-y-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => handleMode(m.value)}
              className={[
                'w-full flex items-start gap-3 px-3 py-2 rounded border text-left transition-colors',
                config.anchorMode === m.value
                  ? 'bg-accent/10 border-accent'
                  : 'border-border hover:border-border-hover',
              ].join(' ')}
            >
              <div>
                <p className={['text-xs font-medium', config.anchorMode === m.value ? 'text-accent' : 'text-text-primary'].join(' ')}>
                  {m.label}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{m.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Anchor trigger */}
      <div>
        <p className="text-xs text-text-muted mb-2">Open overlay on</p>
        <div className="flex gap-2">
          {(['click', 'hover'] as const).map((t) => (
            <button
              key={t}
              onClick={() => updateConfig({ anchorTrigger: t })}
              className={[
                'flex-1 py-1.5 rounded text-xs border transition-colors capitalize',
                config.anchorTrigger === t
                  ? 'bg-accent border-accent text-white'
                  : 'border-border text-text-muted hover:border-border-hover hover:text-text-primary',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
