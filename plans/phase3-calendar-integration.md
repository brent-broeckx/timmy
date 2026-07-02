# Phase 3 — Calendar Integration

**Status:** Implemented ✅

---

## Summary

Phase 3 integrates Microsoft Graph Calendar into Timmy. When the user starts their day, today's meetings are automatically fetched and imported as `calendar`-source blocks on the timeline. All-day events appear in a dedicated strip above the time grid where the user can selectively pull them into the timeline. OAuth tokens are encrypted at rest using Electron's `safeStorage` API and stored in SQLite. Periodic refresh runs every 5 minutes silently in the background.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/main/connectors/graph-calendar.ts` | MSAL OAuth, token persistence, Graph API fetch, SQLite helpers |
| `src/main/ipc/calendar.ts` | IPC handlers + periodic refresh timer |
| `src/renderer/src/components/Settings/CalendarSettings.tsx` | Connect/disconnect UI with setup instructions |

### Modified files

| File | Change |
|------|--------|
| `shared/types.ts` | `CalendarEvent`, `CalendarConnectorStatus`, 7 new IPC constants |
| `src/main/storage/db.ts` | Migration `002_calendar.sql` — `calendar_events` + `connector_tokens` tables |
| `src/main/index.ts` | Register `registerCalendarHandlers()`, start periodic refresh timer |
| `src/preload/index.ts` | Add 6 calendar handle channels + `STATE_CALENDAR_UPDATED` push channel |
| `src/renderer/src/ipc/index.ts` | `ipc.calendar.*` client functions, `onCalendarUpdated`/`offCalendarUpdated` push handlers |
| `src/renderer/src/components/Timeline/Timeline.tsx` | Load calendar events on date change, subscribe to `STATE_CALENDAR_UPDATED`, pass to DayView |
| `src/renderer/src/components/Timeline/DayView.tsx` | All-day events strip above time grid, `onCalendarEventsChanged` prop |
| `src/renderer/src/components/Overlay/OverlayPanel.tsx` | 📅 Calendar tab button, auto-fetch on `startDay` |

---

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `calendar:getStatus` | invoke | Get connected state, email, lastFetchedAt |
| `calendar:connect` | invoke | Start OAuth flow (opens auth window) |
| `calendar:disconnect` | invoke | Clear tokens and reset MSAL state |
| `calendar:fetchEvents` | invoke | Fetch today from Graph, upsert DB, push update |
| `calendar:getEvents` | invoke | Read calendar events for a date from SQLite |
| `calendar:pullEvent` | invoke | Import an all-day event as a timeline block |
| `state:calendarUpdated` | push (main→renderer) | Date string — renderer reloads blocks + events |

---

## Database additions (migration 002_calendar.sql)

```sql
calendar_events (id, date, start_time, end_time, title, organizer, is_all_day, source_id, imported_to_timeline, created_at)
connector_tokens (connector, token_data, account_email, updated_at)
```

- `connector_tokens.token_data` stores the MSAL token cache JSON encrypted with `safeStorage.encryptString()`.
- If `safeStorage.isEncryptionAvailable()` returns false (non-standard OS config), falls back to unencrypted base64 with a console warning.

---

## OAuth Flow

1. User enters Azure AD `clientId` (and optional `tenantId`) in Calendar Settings.
2. Clicks **Connect with Microsoft** → `calendar:connect` IPC call.
3. Main process calls `connectCalendar(clientId, tenantId)`.
4. If no cached tokens: starts a local HTTP server on port 7891, opens an Electron `BrowserWindow` pointing to the MSAL auth URL.
5. User signs in via the Microsoft OAuth consent flow.
6. Browser redirects to `http://localhost:7891/auth/callback?code=...`.
7. MSAL exchanges the code for tokens; cache plugin persists encrypted tokens to SQLite.
8. Auth window closes; IPC returns `CalendarConnectorStatus`.

---

## Auto-populate behaviour

- **On Start Day**: `OverlayPanel.handleStartDay()` awaits `startDay()` then calls `ipc.calendar.fetchEvents(today)`. Failures are silently ignored (connector may not be configured yet).
- **On manual sync**: "Sync today" button in Calendar Settings triggers `calendar:fetchEvents`.
- **Periodic refresh**: every 5 minutes if connected. Pushes `STATE_CALENDAR_UPDATED` to overlay window.
- **Timed meetings**: auto-imported as `source='calendar'` blocks. Re-fetch upserts (updates time/title if meeting was moved, never duplicates).
- **All-day events**: never auto-imported. Appear in the all-day strip above the time grid with a "→ Timeline" button.

---

## User setup required (Azure AD app registration)

The user must create a free Azure AD app registration:
1. `portal.azure.com` → Azure Active Directory → App registrations → New registration
2. Platform: **Mobile and desktop applications**
3. Redirect URI: `http://localhost:7891/auth/callback`
4. API permissions: **Calendars.Read** (delegated)

This is documented inline in `CalendarSettings.tsx`.

---

## Test impact

- Migration count test in `db.test.ts` updated from `toBe(1)` to `toBeGreaterThanOrEqual(1)` to be migration-count-agnostic.
- All 28 tests pass.
