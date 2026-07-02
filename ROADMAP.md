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

- [ ] **Microsoft Graph API integration**
  - OAuth login (read-only scopes: `Calendars.Read`)
  - Fetch today's calendar events on Start Day
  - Auto-populate meetings as fixed blocks on the timeline
  - Refresh periodically to catch late additions

- [ ] **All-day event handling**
  - All-day events shown in a separate strip above the timeline
  - Never auto-included as time blocks
  - "Pull into timeline" button per event

- [ ] **Overlapping meeting resolution UI**
  - Side-by-side display for overlapping calendar events
  - Neither assumed attended — user explicitly keeps or removes each
  - Visual indicator and helper text explaining the overlap

- [ ] **Meeting block metadata**
  - Meeting title, organizer, duration visible on hover
  - Work order auto-suggested based on meeting title + description (AI routing, Phase 5)

- [ ] **Credentials storage**
  - OAuth tokens stored in Windows Credential Manager
  - Token refresh handled silently

### Exit Criteria
Calendar events populate automatically every morning. The timeline for any consultant is already 60–70% complete before they touch anything. Managers and analysts have a fully usable tool from this phase alone.

---

## Phase 4 — AI Work Order Routing
*Goal: Activities are automatically mapped to the right work order.*

- [ ] **AI routing engine**
  - On activity import (meeting, commit, ticket), call AI API with activity metadata + work order descriptions
  - API call is local (no data retained by AI provider beyond the request)
  - Returns suggested project + work order
  - Confidence score shown subtly on the block

- [ ] **Routing config**
  - Plain-language work order descriptions editable in settings
  - Routing improves as descriptions are refined
  - User corrections feed into local preference store (not sent anywhere)

- [ ] **Manual override always available**
  - Dropdown on every block to reassign project/work order regardless of AI suggestion
  - Override is instant, no confirmation needed

- [ ] **Routing explainability**
  - Hover on suggested work order shows brief "Why this?" tooltip
  - Helps user understand and correct routing over time

### Exit Criteria
Most activities are routed to the correct work order without user intervention. The timeline goes from scaffold to near-complete automatically for a typical day.

---

## Phase 5 — Playwright Auto-Submit
*Goal: End-of-day submission is one button.*

- [ ] **Setup wizard**
  - Guides user through mapping their time registration web app fields
  - "Click the project dropdown" → wizard records the selector
  - "Click the work order field" → records selector
  - "Click the hours field" → records selector
  - Stores field map locally in config

- [ ] **Submit engine**
  - On Submit click, Playwright opens or attaches to the time registration web app
  - Iterates through finalized timeline entries
  - Fills each row: project, work order, hours (decimal), description
  - Pauses for user to review before final save

- [ ] **Error handling**
  - If a field can't be found, highlights the problematic entry in the timeline
  - User can re-run setup wizard to remap fields
  - Partial submit support (submit what worked, flag what didn't)

- [ ] **Submit history**
  - Log of successful submits per day stored locally
  - User can view what was submitted and when

### Exit Criteria
End-of-day time registration takes under two minutes including review. The tool has delivered its full value proposition.

---

## Phase 6 — Multi-User & Distribution
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

- [ ] **Onboarding flow**
  - First-run wizard: set anchor position, shortcut, connect calendar, configure first project
  - Takes under 5 minutes

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
