# AGENTS.md — Timmy Project Knowledge Base

This file is the primary reference for any AI agent working on this codebase.
Read it before writing any code. Update it when you learn something new about the project.

---

## Project Overview

Timmy is a Windows desktop time-tracking app built with Electron + React + TypeScript.
It is privacy-first: all data lives locally in SQLite, no cloud, no telemetry.
See `PROJECT.md` for the full product spec and `ROADMAP.md` for the phase plan.

---

## Actual Folder Structure

```
timmy/
├── shared/
│   └── types.ts              # All shared types + IPC channel constants
├── src/
│   ├── main/                 # Electron main process (Node.js)
│   │   ├── index.ts          # App entry: windows, tray, shortcuts, IPC setup
│   │   ├── ipc/
│   │   │   ├── storage.ts    # All ipcMain.handle() handlers (timeline, tasks, config)
│   │   │   ├── calendar.ts   # Outlook CSV calendar import IPC handlers
│   │   │   └── submit.ts     # Playwright auto-submit IPC handlers
│   │   ├── connectors/
│   │   │   └── outlook-csv-calendar.ts # Outlook CSV import + sourceId dedupe
│   │   ├── playwright/
│   │   │   ├── errors.ts     # Typed Playwright error classes
│   │   │   ├── session.ts    # Persistent Chromium context (Entra ID SSO)
│   │   │   ├── wizard.ts     # Field mapping wizard (click capture)
│   │   │   ├── navigate.ts   # YYYYWW week navigation + ISO week utils
│   │   │   └── submit.ts     # Core submit engine
│   │   └── storage/
│   │       ├── db.ts         # SQLite singleton + migration runner
│   │       └── __tests__/
│   │           └── db.test.ts
│   ├── preload/
│   │   ├── index.ts          # contextBridge — exposes window.timmy
│   │   └── index.d.ts        # TypeScript types for window.timmy
│   └── renderer/
│       ├── index.html
│       └── src/              # React renderer process
│           ├── App.tsx       # Route: overlay vs quick-capture window
│           ├── main.tsx      # React entry point
│           ├── env.d.ts
│           ├── styles/
│           │   └── index.css # Tailwind v4 + design tokens
│           ├── ipc/
│           │   └── index.ts  # Typed IPC client — ONLY file that calls window.timmy
│           ├── store/
│           │   ├── useTimelineStore.ts
│           │   ├── useTaskStore.ts
│           │   ├── useConfigStore.ts
│           │   └── __tests__/
│           └── components/
│               ├── Anchor/
│               ├── QuickCapture/
│               ├── Overlay/
│               ├── Timeline/
│               ├── Settings/
│               └── Submit/
│                   ├── DateRangePicker.tsx  # Same-month date range UI
│                   ├── WizardPanel.tsx      # Field mapping wizard UI
│                   └── SubmitPanel.tsx      # Submit flow + progress + result
├── plans/                    # Phase build plans
├── AGENT-PROMPT.md           # Engineering guidelines for AI agents
├── PROJECT.md                # Full product spec
├── ROADMAP.md                # Phased build plan
├── electron.vite.config.ts
├── vitest.config.ts
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
└── package.json
```

---

## Current Phase

**Phase 4 — Playwright Auto-Submit** ✅ CORE COMPLETE (submit history pending)

**Phase 3 — Calendar Integration** ✅ COMPLETE — Outlook CSV import replaces the old Graph connector.

**Phase 2 — Polish & Glass UI** ✅ COMPLETE — see `plans/phase2-polish-glass-ui.md` for detail.

**Phase 1 — Core Loop (MVP)** ✅ COMPLETE

Do NOT implement Phase 4+ features unless explicitly asked.

---

## Architecture Rules (from AGENT-PROMPT.md)

1. **Main/renderer separation**: File system, DB, API calls, Playwright → main process only. Renderer ↔ main via IPC only.
2. **Typed IPC only**: All renderer→main calls go through `src/renderer/src/ipc/index.ts`. Never call `window.timmy.invoke()` directly from components.
3. **IPC whitelist**: The preload (`src/preload/index.ts`) enforces an allowlist of channels. Adding a new channel requires updating both the preload whitelist AND `shared/types.ts`.
4. **No `any`**: `"strict": true` is set. Use `unknown` and type guards instead of `any`.
5. **Undo before mutation**: Every Zustand action that mutates timeline state MUST call the snapshot logic before applying the change. See `useTimelineStore.ts` for the pattern.
6. **Read-only connectors/importers**: External data sources must never write to external systems. Calendar import is manual Outlook CSV only.
7. **Local data only**: No HTTP calls except to approved external APIs (GitHub, Jira, ADO, local LLM). No analytics, no telemetry.

---

## IPC Pattern

### Adding a new channel

1. Add the channel constant to `shared/types.ts` IPC object.
2. Register the handler in `src/main/ipc/storage.ts` (or a new ipc file) using `ipcMain.handle()`.
3. Add the channel to the allowlist in `src/preload/index.ts` (`HANDLE_CHANNELS` set).
4. Add a typed function to `src/renderer/src/ipc/index.ts`.
5. The handler must return `IpcResponse<T>` — never throw to the renderer.

### One-way messages (send, not invoke)

- Use `ipcMain.on()` in main and `window.timmy.send()` in renderer.
- Add to `SEND_CHANNELS` set in preload.
- Current: `window:showQuickCapture`, `window:hideQuickCapture`, `window:toggleOverlay`.

---

## Two BrowserWindows

The app has two BrowserWindows from startup:

| Window               | Role                            | Always on top | Transparent  |
| -------------------- | ------------------------------- | ------------- | ------------ |
| `overlayWindow`      | Main panel (timeline, settings) | No            | No (Phase 1) |
| `quickCaptureWindow` | Fast task input bar             | Yes           | Yes          |

Both load the same renderer bundle (`src/renderer/`). `App.tsx` checks `?window=quickcapture` in the URL query string to decide which component to render.

The overlay window intercepts `close` and hides instead of quitting. The app lives in the system tray. `app.quit()` is only triggered by the `before-quit` event.

---

## Database (SQLite via better-sqlite3)

- DB file: `%APPDATA%\timmy\timmy.db` (via `app.getPath('userData')`)
- Migrations are embedded as strings in `src/main/storage/db.ts` (not separate .sql files, to survive electron-vite bundling)
- Always use `better-sqlite3`'s synchronous API in main process handlers
- `getDb()` returns the singleton; throws if `initDb()` hasn't been called
- `openDb(path)` is the testable version — pass `':memory:'` in tests

**Adding a migration:**

1. Add a new entry to the `MIGRATIONS` array in `db.ts`:
   ```ts
   { filename: '002_your_name.sql', sql: `ALTER TABLE ...` }
   ```
2. The runner skips already-applied filenames, so existing data is safe.

---

## SQLite ↔ TypeScript naming convention

| SQLite column | TypeScript field                           |
| ------------- | ------------------------------------------ |
| `snake_case`  | `camelCase`                                |
| `project_id`  | `projectId`                                |
| `start_time`  | `startTime`                                |
| `deleted`     | `deleted` (boolean, stored as 0/1 integer) |

All DB→TypeScript mapping happens in `rowToBlock()` in `ipc/storage.ts`.

---

## Zustand Stores

| Store              | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `useTimelineStore` | Today's blocks, day boundary, undo stack    |
| `useTaskStore`     | Currently running task + recent task titles |
| `useConfigStore`   | App config + projects/work orders           |

### Undo stack rules

- Only `useTimelineStore` has an undo stack.
- Every mutating action (`addBlock`, `updateBlock`, `deleteBlock`, `startDay`, `endDay`) snapshots state BEFORE applying and pushes to `undoStack`.
- Stack is capped at `undoDepth` (default 20). Oldest entries are dropped.
- `syncBlockLocal(block)` updates state without touching the undo stack — used when the DB was already updated via a different IPC path (e.g. `task:stop`).

### Cross-store calls

- `useTaskStore` calls `useTimelineStore.getState()` (one-way dependency, no circular imports).
- `useTimelineStore` does NOT import `useTaskStore`. Cross-store concerns (e.g. clearing `currentTask` after undo) are handled in the `Timeline` component.

---

## Styling

- **Framework**: Tailwind CSS v4 (`@tailwindcss/vite` plugin)
- **Design tokens** defined in `@theme {}` block in `src/renderer/src/styles/index.css`
- Token reference:

| Token                      | Value     | Use                    |
| -------------------------- | --------- | ---------------------- |
| `--color-background`       | `#0f0f1a` | Page background        |
| `--color-surface`          | `#161625` | Card/panel backgrounds |
| `--color-surface-elevated` | `#1e1e30` | Inputs, dropdowns      |
| `--color-border`           | `#2a2a40` | Borders                |
| `--color-accent`           | `#6c63ff` | Interactive elements   |
| `--color-text-primary`     | `#e8e8f0` | Body text              |
| `--color-text-muted`       | `#6e6e88` | Secondary text         |

- Phase 1: no transparency on the overlay window. `backgroundColor: '#0f0f1a'` is set on the BrowserWindow.
- Phase 2: set `transparent: true` and add `backdrop-filter: blur(12px)` for glassmorphism.

---

## Running the App

```bash
# Development (hot reload)
npm run dev

# Typecheck only
npm run typecheck

# Build for production
npm run build

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch
```

---

## Testing

- **Framework**: Vitest (configured in `vitest.config.ts`)
- Two test environments:
  - `main` — Node.js environment for `src/main/**/*.test.ts`
  - `renderer` — jsdom environment for `src/renderer/src/**/*.test.{ts,tsx}`
- Renderer tests mock the entire `../../ipc` module with `vi.mock()`.
- DB tests use `openDb(':memory:')` — no Electron required.
- `window.timmy` is stubbed in `src/renderer/src/__tests__/setup.ts`.

---

## Known Issues / Phase 1 Limitations

- **Undo does not restore `currentTask` in task store**: If the user undoes a task-start, the block disappears from the timeline but the `currentTask` in `useTaskStore` is cleared by the `Timeline` component's `Ctrl+Z` handler (post-undo check). This is correct behaviour, not a bug.
- **No glassmorphism**: Deferred to Phase 2 per ROADMAP.
- **No anchor corner positioning**: Deferred to Phase 2.
- **QuickCapture window blurs to hide**: The `blur` event hides the quick-capture window automatically. This is intentional.
- **Global shortcut only registers once**: If the shortcut conflicts with another app, the user must change it in Settings (config persists to SQLite).
- **native module**: `better-sqlite3` is rebuilt via `postinstall`. If you see `Error: The module ... was compiled against a different Node.js version`, run `npx electron-rebuild -f -w better-sqlite3`.

---

## Electron Forge

**Deferred to Phase 7.** The project uses `electron-builder` (from the scaffold) for packaging. When Phase 7 arrives:

- Run `npx electron-forge import` to add Forge on top
- Or configure `electron-builder` packaging directly (already partially set up via `electron-builder.yml`)

---

## Adding a New Phase Feature Checklist

1. Read the relevant section in `ROADMAP.md` to understand scope and exit criteria.
2. Update `plans/` with a plan doc before writing any code.
3. If adding an IPC channel: follow the 5-step IPC pattern above.
4. If adding a new DB table: add a new migration entry in `db.ts`.
5. If adding a new connector/importer (Phase 3+): create it in `src/main/connectors/`. External systems stay read-only; calendar data comes from manual Outlook CSV import.
6. Never add `// TODO` comments — either implement it or leave it out.
