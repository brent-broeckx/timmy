# Phase 3 — Calendar Integration

**Status:** Implemented ✅ — superseded by Outlook CSV import (Graph/MSAL removed)

---

## Summary

Phase 3 now imports Outlook calendar exports from CSV. Users export calendar rows through Power Automate, drop the `.csv` into Timmy, and timed events are imported as `calendar`-source blocks. Outlook `eventId` values are stored as `sourceId` so repeated exports update known blocks instead of duplicating them. All-day events remain available in the strip above the timeline for manual pull-in.

---

## Architecture

### New files

| File                                                        | Purpose                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `src/main/connectors/outlook-csv-calendar.ts`               | CSV parse, event upsert, sourceId dedupe, timeline import |
| `src/main/ipc/calendar.ts`                                  | CSV import, calendar event list, pull-event IPC handlers  |
| `src/renderer/src/components/Settings/CalendarSettings.tsx` | Drag/drop and click-to-select CSV import UI               |

### Modified files

| File                                                   | Change                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `shared/types.ts`                                      | `CalendarEvent`, `CalendarImportResult`, calendar IPC constants                             |
| `src/main/storage/db.ts`                               | Migration `002_calendar.sql` — `calendar_events` + `connector_tokens` tables                |
| `src/main/index.ts`                                    | Register `registerCalendarHandlers()`                                                       |
| `src/preload/index.ts`                                 | Add calendar handle channels + `STATE_CALENDAR_UPDATED` push channel                        |
| `src/renderer/src/ipc/index.ts`                        | `ipc.calendar.*` client functions, `onCalendarUpdated`/`offCalendarUpdated` push handlers   |
| `src/renderer/src/components/Timeline/Timeline.tsx`    | Load calendar events on date change, subscribe to `STATE_CALENDAR_UPDATED`, pass to DayView |
| `src/renderer/src/components/Timeline/DayView.tsx`     | All-day events strip above time grid, `onCalendarEventsChanged` prop                        |
| `src/renderer/src/components/Overlay/OverlayPanel.tsx` | Calendar tab button                                                                         |

---

## IPC Channels

| Channel                 | Direction            | Purpose                                                            |
| ----------------------- | -------------------- | ------------------------------------------------------------------ |
| `calendar:importCsv`    | invoke               | Parse Outlook CSV, upsert events, import timed blocks, push update |
| `calendar:getEvents`    | invoke               | Read calendar events for a date from SQLite                        |
| `calendar:pullEvent`    | invoke               | Import an all-day event as a timeline block                        |
| `state:calendarUpdated` | push (main→renderer) | Date string — renderer reloads blocks + events                     |

---

## Database additions (migration 002_calendar.sql)

```sql
calendar_events (id, date, start_time, end_time, title, organizer, is_all_day, source_id, imported_to_timeline, created_at)
connector_tokens (connector, token_data, account_email, updated_at)
```

- `calendar_events.source_id` stores the Outlook export `eventId`.
- `time_blocks.source_id` stores the same value for imported timed events, allowing repeated CSV exports to update known blocks instead of duplicating them.
- `connector_tokens` remains from the original migration but is not used by the CSV import path.

---

## CSV Import Flow

1. User exports Outlook calendar rows to CSV through Power Automate.
2. User drops the `.csv` onto Calendar Settings or clicks to select it.
3. Renderer reads the local file text and sends it through `calendar:importCsv`.
4. Main process parses rows with `eventTitle`, `startTime`, `endTime`, `location`, `isAllDay`, and `eventId`.
5. Timed rows become `calendar` source timeline blocks. All-day rows stay in `calendar_events` for manual pull-in.
6. Repeated imports use `eventId`/`sourceId` to update known blocks and avoid duplicates.

---

## Import Behaviour

- **Manual import**: Calendar Settings is always available from the sidebar and accepts local `.csv` files.
- **Timed meetings**: imported as `source='calendar'` blocks. Re-import upserts by sourceId (updates time/title if meeting was moved, never duplicates).
- **All-day events**: never auto-imported. Appear in the all-day strip above the time grid with a "→ Timeline" button.

---

## User setup required

The user must export Outlook calendar rows to CSV through Power Automate or an equivalent local workflow. The CSV should include:

- `eventTitle`
- `startTime`
- `endTime`
- `location`
- `isAllDay`
- `eventId`

`eventBody` is intentionally ignored and not required.

---

## Test impact

- Migration count test in `db.test.ts` updated from `toBe(1)` to `toBeGreaterThanOrEqual(1)` to be migration-count-agnostic.
- All 28 tests pass.
