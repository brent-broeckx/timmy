# Timmy — Project Specification

> A desktop overlay time companion for consultants. Windows-first.

---

## Vision

Timmy is a lightweight, privacy-first desktop application that helps consultants and developers track their working day and automatically submit time registrations — without changing how they work.

Most time tracking tools either demand constant manual input or make unreliable assumptions about what you were doing. Timmy sits in between: it collects hard facts from the tools you already use (calendar, git, tickets), surfaces them visually on a glassy overlay timeline, lets you fill and adjust gaps quickly with an intuitive UI, and then submits everything automatically to your company's time registration web app via browser automation.

No data ever leaves your machine. No cloud. No surveillance. Read-only access to all integrations.

---

## Target Users

- **Developers** at large consultancies rotating across multiple client projects
- **Managers and analysts** who primarily have calendar-driven days
- Anyone who currently reconstructs their day from memory into a notepad before manually clicking through a time registration form

---

## Core Principles

- **Zero behavior change required** — the tool works with data you already produce
- **Manual control always wins** — automation suggests, the user decides
- **Privacy first** — all data stored locally, no cloud sync, read-only API access
- **Fast above all** — the quick-capture bar and timeline adjustments should never take more than a few seconds
- **Non-intrusive** — the app lives quietly on screen and never interrupts focus

---

## Platform

- **Windows only** (initial release)
- Mac and Linux support planned for later
- Built with **Electron** (Node.js ecosystem, native Playwright integration, best Windows transparency/glassmorphism support, mature global shortcut and tray APIs)

---

## Features

### 1. Anchor Widget

A small persistent element anchored to a user-chosen screen corner or hidden entirely to the system tray.

**When a task is running (default visible state):**

- Pulsing dot indicator
- Truncated task name
- Live elapsed time counter (e.g. `● Writing spec... 0:42`)
- Small square stop button

**When no task is running:**

- Minimal icon or clock, barely noticeable

**Configurable options:**

- Hide task name and elapsed time — only the pulsing dot is shown
- Hide the anchor entirely — app lives only in the Windows system tray (bottom-right). Opened via global shortcut or tray icon click

Hovering or clicking the anchor expands into the full overlay panel.

---

### 2. Overlay Panel

A glassy, frosted-glass transparent panel that expands from the anchor corner toward the center of the screen.

- Left corner → opens rightward
- Right corner → opens leftward
- Contains the full day timeline, controls, and submit button
- Non-fullscreen — designed to coexist with other open windows

**Controls in the panel:**

- Start Day button (sets the left edge of the timeline)
- End Day button (sets the right edge)
- Submit button (triggers Playwright auto-fill)
- Settings shortcut

---

### 3. Day Timeline

The core of the overlay panel. A visual, horizontal (or vertical) timeline of the full working day.

**Auto-populated anchors (from integrations):**

- Calendar meetings — shown as solid blocks with exact start/end times
- Git commits — shown as lighter anchor markers with repo and message
- Ticket status changes (Jira, Azure Boards) — shown as markers
- Azure DevOps activity — shown as markers

**Gap blocks:**

- Empty time between anchors is shown as unfilled blocks
- Visually distinct from filled blocks — prompts the user to assign them

**All-day calendar events:**

- Never auto-included as time blocks
- Shown in a separate strip above the timeline
- "Pull into timeline" button available per event if user wants to count that time

**Overlapping events:**

- Shown side-by-side (like Google Calendar), splitting the column
- Visual indicator when events fully overlap
- Neither is assumed attended — user resolves manually

**Per-block interactions:**

- Click to select
- Time slider: drag to adjust duration in minutes, auto-converts to decimal hours
  - 15 min → 0.25
  - 30 min → 0.50
  - 45 min → 0.75
  - 60 min → 1.00
  - 90 min → 1.50
  - 120 min → 2.00
- Right-click → context menu: Edit, Delete, Duplicate, Reuse
- Delete key when block is selected
- Soft delete: block briefly shows "Undo" toast before permanent removal
- Full undo stack via Ctrl+Z (minimum 20 steps)

---

### 4. Quick-Capture Bar

Opened via a configurable global keyboard shortcut (default: `Ctrl+Shift+Space`).

- Appears centered on screen, slightly above the midpoint
- Same glassy frosted-glass style as the overlay
- Dismissed with Escape (no action taken)

**Behavior:**

- User types a task description and presses Enter
- If a task is currently running → it ends automatically, new task starts
- If no task is running → new task starts from current time
- The started task immediately appears on the anchor widget with elapsed time

**Autocomplete:**

- `/reuse <taskname>` — ghost-text inline autocomplete from recent tasks (VSCode inline suggestion style, grey ghost text)
- Fuzzy match without command: if input resembles a recent task, a suggestion appears below the bar: `Did you mean: "Reviewing PR #142"? → Tab to accept`
- Tab key accepts the suggestion; visually labeled so the user knows Tab does this

**Slash commands (extensible):**

- `/reuse <name>` — prefill from recent task history
- `/stop` — stop current task without starting a new one
- `/note <text>` — attach a note to the current running task
- More commands can be added in future phases

---

### 5. Work Order Mapping

Work orders are the job codes used in the time registration tool (per project, per activity type).

**One-time configuration per project:**

- User defines a project with one or more work orders
- Each work order has a plain-language description of what it covers
- Example:
  ```
  Project: Client Acme
    WO-1001 — Development work, coding, PRs, code reviews
    WO-1002 — Testing, QA, environment verification
    WO-1003 — Meetings, calls, stakeholder communication
    WO-1004 — Documentation, planning, refinement
  ```

**AI routing:**

- When an activity is pulled in (commit, meeting, ticket), an AI layer reads its content and maps it to the most likely work order based on descriptions
- User can always override the assignment in the timeline
- New work order added → immediately available for routing

**Multi-project support:**

- Multiple active projects at once, each with their own work orders
- User assigns each timeline block to both a project and a work order

---

### 6. Connector Architecture

All connectors are **read-only**. The app never writes to any external system except the time registration tool (via Playwright submit).

**Universal connector:**

- Microsoft Teams / Outlook calendar — works for all users regardless of role

**Developer connectors (optional):**

- GitHub / Azure DevOps — pulls commits, PR activity
- Jira / Azure Boards — pulls ticket status changes, comments

**Manual entry:**

- Any user can manually add an anchor block at a specific time with a description
- Designed for managers, analysts, or anyone on unsupported platforms
- Same UI as an automatically pulled block once added

**Plug-in architecture:**

- Connectors are isolated modules
- New connectors can be added without touching core timeline logic
- Community or company-specific connectors possible later

---

### 7. Submit Flow (Playwright Auto-Fill)

**One-time setup wizard:**

- User opens the time registration web app in the setup wizard
- Wizard walks through mapping: "which dropdown is the project?", "which field is hours?", "which field is the work order code?"
- Mappings stored locally in config

**Daily submit:**

- User reviews the finalized timeline in the overlay
- Clicks Submit
- Playwright opens (or attaches to) the time registration web app
- Fills in all entries: project, work order code, hours (decimal), description
- User confirms in the browser before final save (never auto-saves without confirmation)

---

### 8. Settings & Configuration

- Anchor position (corner choice or hidden)
- Anchor display mode (full / dot-only / hidden)
- Global shortcut for quick-capture bar
- Connector credentials and scopes (stored locally, encrypted)
- Work order project configuration
- Submit field mappings (Playwright config)
- Theme (glassmorphism intensity, dark/light base)
- Undo stack depth

---

## Privacy & Security

- **All data stored locally** in the user's app data directory
- **No cloud sync** of any kind
- **Read-only external integrations**; calendar import is local CSV only
- **Credentials encrypted at rest** using the OS keychain (Windows Credential Manager)
- **Playwright runs locally** — the browser automation never routes through any external server
- The app does not phone home, send telemetry, or log to any external service

---

## Tech Stack

| Layer                | Technology                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Desktop shell        | Electron (Windows)                                                                       |
| Frontend (UI)        | React + TypeScript                                                                       |
| Styling              | Tailwind CSS + custom glassmorphism CSS                                                  |
| Browser automation   | Playwright (Node.js)                                                                     |
| Local storage        | SQLite via better-sqlite3                                                                |
| AI routing           | Local Ollama (should be adapter and configurable by user) (local call, no data retained) |
| Calendar integration | Outlook CSV import (local, eventId dedupe)                                               |
| Git integration      | Git log parsing / GitHub REST API                                                        |
| Ticket integration   | Jira REST API / Azure DevOps REST API                                                    |
| Build tooling        | Vite + Electron Forge                                                                    |
| Package manager      | npm workspaces (monorepo)                                                                |

---

## Out of Scope (v1)

- Mac or Linux support
- Mobile companion app
- Cloud sync or multi-device support
- Writing to any integration (calendar, git, tickets)
- Real-time collaboration or shared timelines
- Billing or invoicing features
- Automatic time inference without user confirmation
