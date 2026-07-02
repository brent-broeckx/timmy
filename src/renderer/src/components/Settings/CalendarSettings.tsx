// src/renderer/src/components/Settings/CalendarSettings.tsx
// Microsoft Graph Calendar connector settings.
// When VITE_GRAPH_CLIENT_ID is set at build time, users just see Connect/Disconnect.
// When it is not set, users can enter their own Azure AD Client ID.

import { useState, useEffect } from 'react'
import { useConfigStore } from '../../store/useConfigStore'
import { ipc } from '../../ipc'
import type { CalendarConnectorStatus } from '@shared/types'

// Baked-in client ID from build env (empty string if not set)
const BAKED_CLIENT_ID = (import.meta.env.VITE_GRAPH_CLIENT_ID as string | undefined) ?? ''

function getGraphConnectorConfig(config: ReturnType<typeof useConfigStore.getState>['config']): {
  clientId: string
  tenantId: string
} {
  const conn = config.connectors.find((c) => c.type === 'graph-calendar')
  return {
    clientId: conn?.config?.clientId ?? '',
    tenantId: conn?.config?.tenantId ?? 'common',
  }
}

export function CalendarSettings(): React.JSX.Element {
  const config = useConfigStore((s) => s.config)
  const updateConfig = useConfigStore((s) => s.updateConfig)

  const { clientId: savedClientId, tenantId: savedTenantId } = getGraphConnectorConfig(config)

  const [clientId, setClientId] = useState(savedClientId)
  const [tenantId, setTenantId] = useState(savedTenantId)
  const [status, setStatus] = useState<CalendarConnectorStatus>({
    connected: false,
    email: null,
    lastFetchedAt: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchMsg, setFetchMsg] = useState<string | null>(null)

  const hasBakedId = BAKED_CLIENT_ID.length > 0

  useEffect(() => {
    ipc.calendar.getStatus().then(setStatus).catch(() => {})
  }, [])

  function saveCredentials(): void {
    const connectors = config.connectors.filter((c) => c.type !== 'graph-calendar')
    connectors.push({
      type: 'graph-calendar',
      enabled: true,
      config: { clientId: clientId.trim(), tenantId: tenantId.trim() || 'common' },
    })
    updateConfig({ connectors })
  }

  async function handleConnect(): Promise<void> {
    setError(null)
    if (!hasBakedId && !clientId.trim()) {
      setError('Enter your Azure AD Client ID first.')
      return
    }
    if (!hasBakedId) {
      saveCredentials()
      await new Promise((r) => setTimeout(r, 150))
    }
    setLoading(true)
    try {
      const s = await ipc.calendar.connect()
      setStatus(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect(): Promise<void> {
    setError(null)
    setLoading(true)
    try {
      await ipc.calendar.disconnect()
      setStatus({ connected: false, email: null, lastFetchedAt: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleFetchToday(): Promise<void> {
    setError(null)
    setFetchMsg(null)
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const result = await ipc.calendar.fetchEvents(today)
      if (result.found === 0) {
        setFetchMsg('No events found from Microsoft for today.')
      } else if (result.imported > 0 && result.allDay === 0) {
        setFetchMsg(`${result.imported} meeting${result.imported !== 1 ? 's' : ''} added to timeline.`)
      } else if (result.imported > 0 && result.allDay > 0) {
        setFetchMsg(
          `${result.imported} meeting${result.imported !== 1 ? 's' : ''} added to timeline. ` +
          `${result.allDay} all-day event${result.allDay !== 1 ? 's' : ''} — see the strip above the timeline.`,
        )
      } else if (result.allDay > 0 && result.imported === 0) {
        setFetchMsg(
          `${result.allDay} all-day event${result.allDay !== 1 ? 's' : ''} found. ` +
          `Switch to the timeline — they appear above the time grid where you can pull them in.`,
        )
      } else {
        // found > 0, imported = 0, allDay = 0: all timed events already existed
        setFetchMsg(`${result.found} event${result.found !== 1 ? 's' : ''} already on timeline — nothing new.`)
      }
      const s = await ipc.calendar.getStatus()
      setStatus(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <h2 className="text-sm font-semibold text-text-primary">Microsoft Calendar</h2>

      {/* Status banner */}
      <div
        className={[
          'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs',
          status.connected
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-white/5 border-border text-text-muted',
        ].join(' ')}
      >
        <span
          className={[
            'w-2 h-2 rounded-full flex-shrink-0',
            status.connected ? 'bg-green-400' : 'bg-text-muted',
          ].join(' ')}
        />
        {status.connected ? (
          <span>
            Connected as <strong>{status.email}</strong>
            {status.lastFetchedAt && (
              <span className="text-text-muted ml-1">
                · last synced{' '}
                {new Date(status.lastFetchedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </span>
        ) : (
          <span>Not connected</span>
        )}
      </div>

      {/* Client ID inputs — only shown when no baked-in ID */}
      {!hasBakedId && !status.connected && (
        <>
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted block">
              Azure AD Client ID
              <span className="text-text-muted/60 ml-1">(required)</span>
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-surface-elevated border border-border text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent font-mono"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-text-muted block">
              Tenant ID
              <span className="text-text-muted/60 ml-1">(optional — defaults to "common")</span>
            </label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="common"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-surface-elevated border border-border text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent font-mono"
              spellCheck={false}
            />
          </div>
        </>
      )}

      {/* Error / success messages */}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {fetchMsg && (
        <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          {fetchMsg}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!status.connected ? (
          <button
            onClick={handleConnect}
            disabled={loading || (!hasBakedId && !clientId.trim())}
            className="flex-1 py-1.5 rounded-lg text-xs bg-accent text-white disabled:opacity-50 hover:bg-accent/90 transition-colors"
          >
            {loading ? 'Connecting…' : 'Connect with Microsoft'}
          </button>
        ) : (
          <>
            <button
              onClick={handleFetchToday}
              disabled={loading}
              className="flex-1 py-1.5 rounded-lg text-xs border border-border text-text-muted hover:text-text-primary hover:border-border-hover disabled:opacity-50 transition-colors"
            >
              {loading ? 'Syncing…' : 'Sync today'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      {/* Setup instructions — only shown when no baked-in ID and not yet connected */}
      {!hasBakedId && !status.connected && (
        <details className="group">
          <summary className="text-xs text-text-muted cursor-pointer select-none hover:text-text-primary transition-colors">
            How to get your Client ID ▸
          </summary>
          <div className="mt-3 space-y-2 text-xs text-text-muted leading-relaxed bg-white/5 border border-border rounded-lg px-4 py-3">
            <p className="font-medium text-text-primary">
              Register a free app — use any personal Microsoft account (outlook.com):
            </p>
            <ol className="space-y-1.5 list-decimal list-inside">
              <li>
                Go to{' '}
                <span className="text-accent">portal.azure.com</span> → Azure Active Directory →
                App registrations → New registration
              </li>
              <li>
                Supported account types:{' '}
                <em>Accounts in any organizational directory … and personal Microsoft accounts</em>
              </li>
              <li>
                Platform: <em>Mobile and desktop applications</em> → Redirect URI:{' '}
                <code className="font-mono bg-white/10 px-1 rounded">
                  http://localhost:7891/auth/callback
                </code>
              </li>
              <li>
                Copy the <strong>Application (client) ID</strong> and paste above
              </li>
              <li>
                API permissions → Add → Microsoft Graph → Delegated:{' '}
                <code className="font-mono bg-white/10 px-1 rounded">Calendars.Read</code>
              </li>
            </ol>
            <p className="mt-2 text-text-muted/70">
              You can use a personal outlook.com account to register — no company Azure AD access
              needed. Work and school accounts can then sign in using the same app.
            </p>
          </div>
        </details>
      )}
    </div>
  )
}

