# Timmy — Roadmap

> Phased build plan designed to produce something genuinely usable as early as possible, then expand.

---

## Guiding Philosophy

Each phase ends with a working, usable tool — not a half-built feature set. Phase 1 alone should save time every single day. Phases build on top of each other without breaking what came before.

---

## Phase 1 — The Core Loop (MVP) ✅ COMPLETE
*Goal: A working daily tool you can use personally from day one.*

This phase is intentionally narrow. No integrations, no AI, no Playwright. Just the scaffold that makes the rest possible and a quick-capture flow that is immediately useful.

### Deliverables

- [x] **Electron app scaffold**
  - Windows desktop app with system tray icon
  - App starts on login (configurable)
  - Single window: overlay panel (no transparency yet, can be added in Phase 2)
  - Two BrowserWindows: `overlayWindow` (960×700, frameless) + `quickCaptureWindow` (640×72, alwaysOnTop, transparent)

- [x] **Start Day / End Day flow**
  - Start Day button creates the day's timeline boundary
  - End Day button closes the active task and locks the timeline for review

- [x] **Quick-capture bar**
  - Global shortcut (`Ctrl+Shift+Space`, configurable in settings)
  - Opens centered input bar (auto-focused)
  - Free text entry → starts a task, ends the previous one
  - Escape closes without action; hides on blur

- [x] **Anchor widget (basic)**
  - Shows current running task name + elapsed time (live wall-clock counter)
  - Square stop button
  - Click to open overlay panel / settings

- [x] **Day timeline (basic)**
  - Lists tasks in order with start time, end time, duration
  - Manual blocks only at this stage (no integrations)
  - Click a block to select it
  - Delete key / right-click → soft delete with 4s undo toast
  - Ctrl+Z undo (20 steps, configurable)

- [x] **Time slider per block**
  - Drag to adjust duration (5–480 min, step 5)
  - Displays both `Xh Ym` and `X.XXh` decimal hours side by side

- [x] **Local SQLite storage**
  - Persist tasks, timeline, work day boundaries
  - Config stored locally at `%APPDATA%\timmy\timmy.db`
  - Migration runner with embedded SQL (survives electron-vite bundling)

- [x] **Basic work order config**
  - User can define projects and work orders manually in settings
  - Full CRUD for projects + work orders
  - Each timeline block can be assigned a project + work order from a dropdown

### Test Results
- **20 / 20 tests passing** across 3 suites:
  - `src/main/storage/__tests__/db.test.ts` — 6 tests (SQLite migrations, FK enforcement, soft delete)
  - `src/renderer/src/store/__tests__/useTimelineStore.test.ts` — 9 tests (undo stack, block CRUD, sort)
  - `src/renderer/src/store/__tests__/useTaskStore.test.ts` — 5 tests (start/stop/clear/loadRecent)

### Exit Criteria ✅
You can start your day, capture tasks as you work via the shortcut, review the timeline at end of day, adjust durations, assign work orders, and export a readable summary. No automation yet — but it already beats a notepad.

---

## Phase 2 — Polish & Glass UI
*Goal: Make it feel like a real, premium product.*

- [x] **Glassmorphism overlay**
  - Frosted glass effect on the overlay panel and quick-capture bar
  - Configurable transparency intensity
  - Dark and light base theme

- [x] **Anchor widget — full implementation**
  - Pulsing dot when task is running
  - Configurable display modes: full / dot-only / hidden
  - Corner positioning (user-configurable: TL, TR, BL, BR)
  - Smart open direction (opens toward center away from chosen corner)
  - Option to hide anchor entirely (tray-only mode)

- [x] **Overlay panel animations**
  - Smooth expand/collapse from anchor
  - Subtle transitions on block interactions

- [x] **Quick-capture bar — autocomplete**
  - Recent tasks stored and surfaced as ghost-text inline suggestions
  - `/reuse <name>` command with autocomplete
  - Fuzzy "Did you mean X? → Tab" suggestion below input bar
  - Tab accepts suggestion (visible label)

- [x] **Slash command system (foundation)**
  - `/reuse` — prefill from recent task
  - `/stop` — stop current task
  - `/note <text>` — attach note to running task
  - Extensible command registry for future additions

- [x] **Soft delete with undo toast**
  - Deleted blocks show brief "Undo" notification before permanent removal

- [x] **Timeline overlapping block support**
  - Side-by-side rendering for overlapping time blocks
  - Visual indicator for full overlaps

### Exit Criteria
The app looks and feels polished. Someone seeing it for the first time understands immediately what it does. The quick-capture bar is fast and smart. Ready to show colleagues.

---

## Phase 3 — Calendar Integration
*Goal: Meetings appear automatically. The timeline has real anchors.*

- [x] **Microsoft Graph API integration**
  - OAuth login (read-only scopes: `Calendars.Read`)
  - Fetch today's calendar events on Start Day
  - Auto-populate meetings as fixed blocks on the timeline
  - Refresh periodically to catch late additions

- [x] **All-day event handling**
  - All-day events shown in a separate strip above the timeline
  - Never auto-included as time blocks
  - "Pull into timeline" button per event

- [x] **Overlapping meeting resolution UI**
  - Side-by-side display for overlapping calendar events (via existing `computeLayout`)
  - Neither assumed attended — user explicitly keeps or removes each
  - Visual indicator and helper text explaining the overlap

- [x] **Meeting block metadata**
  - Meeting title, organizer visible on hover tooltip
  - Work order auto-suggested based on meeting title + description (AI routing, Phase 4)

- [x] **Credentials storage**
  - OAuth tokens encrypted with Electron `safeStorage` (OS credential manager)
  - Token refresh handled silently via MSAL

### Exit Criteria ✅
Calendar events populate automatically every morning. The timeline for any consultant is already 60–70% complete before they touch anything. Managers and analysts have a fully usable tool from this phase alone.

---

## Phase 4 — Playwright Auto-Submit
*Goal: End-of-day submission is one button.*

- [x] **Field mapping wizard**
  - One-time setup: maps period input, row identifier, column header, submit button
  - Click-capture overlay injected into Playwright browser
  - Field map auto-saved to SQLite config on wizard completion
  - Re-runnable from Submit settings

- [x] **Persistent browser session (Entra ID)**
  - `playwright.chromium.launchPersistentContext` saves session to `<userData>/playwright-session`
  - User logs in manually once; subsequent runs reuse the session
  - Session expiry detection: redirects to `login.microsoftonline.com` are caught and surfaced to user
  - Clear session option in Settings

- [x] **Date range picker (renderer)**
  - Calendar UI with same-month constraint (cross-month ranges blocked)
  - Dot indicator on dates with submittable entries
  - Minimum range: 1 day; maximum: full calendar month

- [x] **Week navigation (YYYYWW format)**
  - ISO 8601-compliant week/year calculation (handles Dec/Jan year boundary)
  - Tab-out to trigger table reload after writing period value
  - 2-retry logic before surfacing `NavigationFailedError`

- [x] **Core submit engine**
  - Loads finalized blocks (non-deleted, completed, work order assigned)
  - Groups by ISO week → date → work order; sums to 2 decimal places
  - Fills table cells by row text match + column date match
  - Per-week user confirmation before clicking submit button
  - Fully cancellable at any point
  - Typed error classes for all failure modes

- [x] **Submit progress UI (renderer)**
  - Live progress bar + status message via push IPC
  - Per-week confirmation prompt with entry list
  - Result screen with error list for skipped entries

- [ ] **Submit history**
  - Log of successful submits per day stored locally
  - User can view what was submitted and when

### Exit Criteria
End-of-day time registration takes under two minutes including review. The tool has delivered its full value proposition.

---

## Phase 5 — Multi-User & Distribution
*Goal: Roll out to colleagues.*

- [ ] **Installer (Windows)**
  - Electron Forge Windows installer (.exe / NSIS)
  - Auto-update support (electron-updater)

- [ ] **Shareable work order config**
  - Export/import project + work order config as a JSON file
  - A team lead sets up the config once, shares the file, team imports it

- [ ] **Documentation site**
  - Setup guide, connector configuration, FAQ
  - Internal company wiki page or lightweight static site

- [ ] **Feedback mechanism**
  - Simple in-app "Send feedback" that composes an email or Teams message (no telemetry)

### Exit Criteria
Any colleague can install and be up and running in under 10 minutes. The tool is officially shareable across the company.

---

## Future Considerations (Post v1)

- Mac support (Electron already cross-platform, main effort is transparency/tray API differences)
- Outlook calendar connector as alternative to Graph API
- Richer slash command library
- Timeline templates for recurring day patterns
- Weekly summary view (not just daily)
- Plugin API so colleagues can build their own connectors
- Open-source release
