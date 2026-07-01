# Plan: Phase 1 — Core Loop (MVP)

**Summary**
Build the Phase 1 MVP for Timmy: an Electron + React + TypeScript Windows desktop app that lets a consultant capture tasks throughout the day, review them on a horizontal timeline, adjust durations via a time slider, assign work orders, and have everything persisted locally in SQLite — with no external integrations or automation yet.

The scaffold is created via `npm create @quick-start/electron@latest` (react-ts template), then restructured to match the spec's `electron/` + `src/` + `shared/` folder layout before any feature work begins. Electron Forge is deliberately deferred to Phase 7 (packaging only). The `better-sqlite3` native module rebuild complexity is handled via a `postinstall` npm hook.

**Risks**

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `better-sqlite3` native rebuild fails on first `npm install` | High | Med | Add `"postinstall": "npx electron-rebuild -f -w better-sqlite3"` to `package.json`; document C++ build tools requirement (node-gyp, MSVC Build Tools) in README |
| electron-vite template folder structure diverges from spec's `electron/` layout | Med | Low | Configure `electron.vite.config.ts` entry points after scaffolding — straightforward config override |
| Undo stack gaps — a mutation path that bypasses `pushUndo()` breaks history | Med | Med | Convention: every Zustand action that mutates timeline state calls `pushUndo()` before the mutation. Enforce in code review. |
| Global shortcut `Ctrl+Shift+Space` conflicts with another app | Low | Low | Shortcut is configurable in `AppConfig.quickCaptureShortcut` and persisted in SQLite from day one |
| Elapsed-time counter drift over long sessions | Low | Low | Drive the counter from wall-clock delta `new Date() - new Date(startTime)`, not an accumulated counter |

---

## Phase 1A — Scaffold & Project Structure

**Goal:** A runnable Electron + React + TypeScript app in the correct folder layout, with Tailwind, strict TypeScript, and all Phase 1 dependencies installed. `npm run dev` opens a window.

1. In `c:\development\projects\timmy`, run: `npm create @quick-start/electron@latest . -- --template react-ts`
2. Verify default structure (`src/main/`, `src/preload/`, `src/renderer/`), then reorganise to spec layout:
   - Move `src/main/` → `electron/` (rename `index.ts` → `main.ts`)
   - Move `src/preload/` → `electron/preload/`
   - Move `src/renderer/` contents up to `src/`
   - Create `shared/` at workspace root
3. Update `electron.vite.config.ts`: point `main.entry` at `electron/main.ts`, `preload.input` at `electron/preload/index.ts`, `renderer.root` at `src/`
4. Update `package.json` `"main"` field to `"./out/main/index.js"`
5. Install production dependencies: `npm install better-sqlite3 zustand`
6. Install dev dependencies: `npm install -D @electron/rebuild @types/better-sqlite3 tailwindcss @tailwindcss/vite`
7. Add `"postinstall": "npx electron-rebuild -f -w better-sqlite3"` to `package.json` scripts; run once manually
8. Configure Tailwind: add `@tailwindcss/vite` plugin to the renderer section of `electron.vite.config.ts`; add `@import "tailwindcss"` to `src/styles/index.css`
9. Set `"strict": true` in `tsconfig.json` and `tsconfig.node.json`
10. Create `shared/types.ts` with all data models and IPC channel constants from AGENT-PROMPT.md

**Relevant files**
- `electron.vite.config.ts` — main/preload/renderer entry points + Tailwind plugin
- `package.json` — main field, scripts, postinstall hook
- `tsconfig.json` / `tsconfig.node.json` — strict: true
- `shared/types.ts` — all data models and IPC channel name constants

**Verification**
1. `npm run dev` — app window opens, React renders, no TypeScript errors in console
2. `npx tsc --noEmit` — zero errors with strict mode on
3. `npm run dev` does not crash with a native module error for better-sqlite3

**Decisions**
- Defer Electron Forge to Phase 7. electron-vite's own `dev`/`build` commands fully cover Phase 1.
- Use `@tailwindcss/vite` (Tailwind v4 plugin) — no `tailwind.config.js` needed.

---

## Phase 1B — SQLite Storage Layer

**Goal:** A working SQLite database that opens on app start, runs the initial migration automatically, and is accessible only from the main process via typed IPC handlers.

1. Create `electron/storage/db.ts`: open `better-sqlite3` at `path.join(app.getPath('userData'), 'timmy.db')`; export a singleton `db` instance
2. Create `electron/storage/migrations/001_initial.sql`: full schema from AGENT-PROMPT.md — `time_blocks`, `day_boundaries`, `projects`, `work_orders`, `submit_log`, `recent_tasks` — plus a `migrations` tracking table and a single-row `config` table (key `'app'`, value JSON)
3. Migration runner in `electron/storage/db.ts`: on open, compare `.sql` files in `migrations/` dir against `migrations` table; run outstanding ones in filename order
4. Create `electron/ipc/storage.ts`: register Phase 1 IPC handlers via `ipcMain.handle()` for channels: `timeline:getDay`, `timeline:addBlock`, `timeline:updateBlock`, `timeline:deleteBlock`, `timeline:startDay`, `timeline:endDay`, `task:start`, `task:stop`, `task:getRecent`, `config:get`, `config:set`, `project:list`, `project:create`, `project:update`, `workorder:create`, `workorder:update`, `workorder:delete`
5. All handlers use the synchronous `better-sqlite3` API; return typed `{ data: T | null, error: string | null }` envelopes

**Relevant files**
- `electron/storage/db.ts` — singleton connection + migration runner
- `electron/storage/migrations/001_initial.sql` — full Phase 1 schema
- `electron/ipc/storage.ts` — all IPC handlers

**Verification**
1. After `npm run dev`, inspect `%APPDATA%\timmy\timmy.db` — all tables exist
2. `config:get` via devtools IPC test returns a default `AppConfig` object
3. `timeline:addBlock` persists a row visible in SQLite viewer after app restart

**Decisions**
- Synchronous `better-sqlite3` in main process is correct — IPC calls are already async from the renderer's perspective; no event-loop issues.
- Config stored as single JSON row (`key = 'app'`) in `config` table; projects/work orders are proper relational rows.
- Migration `.sql` files are plain SQL — not TypeScript — to keep them readable and reviewable.

---

## Phase 1C — Main Process Shell

**Goal:** Electron app launches with a system tray icon, a single overlay BrowserWindow, and a second always-on-top QuickCapture BrowserWindow. Global shortcut is registered. contextBridge exposes only the needed channels.

1. Implement `electron/main.ts`:
   - Create overlay `BrowserWindow`: `show: false`, `frame: false`, `transparent: false`, `alwaysOnTop: false`; show on `ready-to-show`
   - Create QuickCapture `BrowserWindow`: `transparent: true`, `frame: false`, `alwaysOnTop: true`, `fullscreen: true`; hidden initially
   - System tray with placeholder icon; tray click toggles overlay window visibility
   - Register global shortcut from config (default `Ctrl+Shift+Space`) → show QuickCapture window and focus its input
   - On `before-quit`: unregister all shortcuts; close both windows
   - Register storage IPC handlers (import `electron/ipc/storage.ts`)
2. Create `electron/preload/index.ts`: `contextBridge.exposeInMainWorld('timmy', { invoke: ipcRenderer.invoke })` — typed by the channel constants in `shared/types.ts`; never expose `ipcRenderer` directly
3. Add IPC channels `window:hideQuickCapture` and `window:showQuickCapture` as simple one-way messages (`ipcMain.on`) — no return value needed

**Relevant files**
- `electron/main.ts` — app lifecycle, two windows, tray, shortcut
- `electron/preload/index.ts` — contextBridge typed API

**Verification**
1. App launches with tray icon visible in Windows system tray
2. `Ctrl+Shift+Space` shows the QuickCapture window centred and focused
3. Tray click shows/hides main overlay window; app does not quit on window close
4. `window.timmy` is defined in renderer devtools; no raw Node APIs exposed

**Decisions**
- Two `BrowserWindow` instances from Phase 1 — overlay and quick-capture have fundamentally different `alwaysOnTop` and transparency requirements; modelling them as separate windows is correct.
- `frame: false` on the overlay window even in Phase 1 — easier to add custom drag handles in React than to remove a native frame later.

---

## Phase 1D — Renderer State (Zustand + IPC Client)

**Goal:** A typed IPC client wrapper and Zustand stores managing timeline, running task, and config — with a working undo stack.

1. Create `src/ipc/index.ts`: export typed async functions per IPC channel (e.g. `getDay(date: string): Promise<TimeBlock[]>`) — the only file in the renderer that calls `window.timmy.invoke(...)`. No other file uses `window.timmy` directly.
2. Create `src/store/useTimelineStore.ts` (Zustand):
   - State: `{ blocks: TimeBlock[], dayBoundary: DayBoundary | null, undoStack: TimelineSnapshot[], undoPointer: number }`
   - `TimelineSnapshot = { blocks: TimeBlock[], dayBoundary: DayBoundary | null }`
   - `pushUndo()`: snapshot current state → push to stack → trim to configured depth (default 20)
   - Actions: `addBlock`, `updateBlock`, `deleteBlock`, `startDay`, `endDay` — each calls `pushUndo()` FIRST, then mutates, then persists via IPC
   - `undo()`: restore previous snapshot from stack, persist reverted state via IPC
3. Create `src/store/useTaskStore.ts`: `{ currentTask: TimeBlock | null, recentTasks: string[] }` with `startTask(title)`, `stopTask()`, `loadRecent()`
4. Create `src/store/useConfigStore.ts`: loads `AppConfig` from IPC on app init; `updateConfig(partial)` merges and persists

**Relevant files**
- `src/ipc/index.ts` — single IPC boundary for renderer
- `src/store/useTimelineStore.ts` — timeline state + undo
- `src/store/useTaskStore.ts` — current task state
- `src/store/useConfigStore.ts` — app config state

**Verification**
1. Devtools: `useTimelineStore.getState().addBlock(mock)` → block in state; `undo()` → block removed
2. Rapid 25 mutations → undo stack never exceeds 20 entries
3. All IPC client functions return typed responses; no `any` in `src/ipc/index.ts`

**Decisions**
- Undo stack stores full state snapshots (not diffs) — simpler, correct, negligible memory at Phase 1 scale.
- No `zustand/middleware/persist` — all persistence is explicit via IPC → SQLite; keeps data flow auditable.

---

## Phase 1E — Anchor Widget

**Goal:** A small persistent element in the overlay panel showing the current task and live elapsed time.

1. Create `src/components/Anchor/AnchorWidget.tsx`:
   - Reads `useTaskStore.currentTask`
   - Task running: pulsing dot + truncated title + elapsed time counter + stop button
   - No task: minimal clock icon
   - Elapsed time: `setInterval` at 100ms computing wall-clock delta `new Date() - new Date(currentTask.startTime)`, formatted as `h:mm`
   - Stop button → `useTaskStore.stopTask()`; rest of widget → show overlay panel
2. Basic Tailwind styling — dark bg, white text, fixed small size. No glassmorphism yet.

**Relevant files**
- `src/components/Anchor/AnchorWidget.tsx`

**Verification**
1. Start task → widget shows title + incrementing elapsed time
2. Stop button → widget returns to minimal state
3. Elapsed time resets when new task starts

---

## Phase 1F — Quick-Capture Bar

**Goal:** Global shortcut opens a centred input bar. Enter starts a task; Escape closes with no action.

1. Create `src/components/QuickCapture/QuickCaptureBar.tsx`:
   - Fullscreen transparent container; centred card with a single autofocused `<input>`
   - `Enter` → `useTaskStore.startTask(input.value)` → IPC `window:hideQuickCapture`
   - `Escape` → IPC `window:hideQuickCapture`, no action
2. QuickCapture window is the second BrowserWindow from Phase 1C; it loads this component at route `/quick-capture`

**Relevant files**
- `src/components/QuickCapture/QuickCaptureBar.tsx`
- `electron/main.ts` — QuickCapture window show/hide

**Verification**
1. `Ctrl+Shift+Space` opens bar; type "Testing task", Enter → bar closes, task in anchor widget
2. Escape → bar closes, no new task, previous task still running

---

## Phase 1G — Overlay Panel & Timeline

**Goal:** A panel listing the day's time blocks with Start/End Day buttons, selection, delete with soft-delete toast, time slider, and `Ctrl+Z` undo.

1. Create `src/components/Overlay/OverlayPanel.tsx`: Start Day / End Day buttons; renders `<Timeline />`
2. Create `src/components/Timeline/Timeline.tsx`: reads today's blocks from store; keyboard handler for `Ctrl+Z`; renders list of `<TimeBlock />`
3. Create `src/components/Timeline/TimeBlock.tsx`:
   - Display: start time, end time, title, `Xh Ym` + decimal hours (e.g. `1.42h`) side by side
   - Click to select; `Delete` key or right-click → Delete → triggers soft delete
   - When selected: show `<input type="range" min=15 max=480 step=15>` in minutes; on change compute `endTime = startTime + sliderMinutes`; compute decimal with `Math.round(minutes / 60 * 100) / 100`; call `updateBlock`
4. Create `src/components/Timeline/SoftDeleteToast.tsx`: 4-second countdown with "Undo" button; uses `useRef` for cancellable `setTimeout`; clicking Undo cancels the timeout and calls `useTimelineStore.undo()`; after 4s deletion is already committed to SQLite (no second call needed)
5. Project + work order `<select>` dropdowns on each block (populated from `useConfigStore`)

**Relevant files**
- `src/components/Overlay/OverlayPanel.tsx`
- `src/components/Timeline/Timeline.tsx`
- `src/components/Timeline/TimeBlock.tsx`
- `src/components/Timeline/SoftDeleteToast.tsx`

**Verification**
1. Start Day → boundary stored; End Day → end time stored
2. Add 5 tasks via Quick-Capture → all appear on timeline in order
3. Select block → time slider visible; drag → decimal hours update live
4. Delete → toast appears; Undo within 4s → block reappears
5. `Ctrl+Z` reverses any mutation type
6. 21 mutations → undo stack remains at 20

---

## Phase 1H — Work Order Settings

**Goal:** User can define projects and work orders in a settings screen; timeline blocks can be assigned to them.

1. Create `src/components/Settings/WorkOrderSettings.tsx`: list of projects with expandable work orders; inline edit forms; "+ Add" buttons for project and work order; all changes persist via project/workorder IPC channels
2. Project + work order selectors already added in Phase 1G TimeBlock component; they read from `useConfigStore.projects`

**Relevant files**
- `src/components/Settings/WorkOrderSettings.tsx`
- `electron/ipc/storage.ts` — project/workorder handlers (defined in Phase 1B)
- `src/components/Timeline/TimeBlock.tsx` — project/WO selectors

**Verification**
1. Create project "Client Acme" with WO-1001 "Development" → appears in settings
2. Assign WO to a timeline block → survives app restart
3. Null project/WO on a block renders gracefully (no crash)

---

## Decisions

- **Electron Forge deferred to Phase 7.** `electron-vite dev/build` fully covers Phase 1 development. Forge can be imported via `npx electron-forge import` when packaging is needed.
- **No glassmorphism in Phase 1.** ROADMAP explicitly reserves transparency/glass for Phase 2.
- **Two BrowserWindows from Phase 1.** Overlay and quick-capture have fundamentally different `alwaysOnTop` and transparency requirements.
- **Undo stack as full snapshots.** Simpler to implement correctly. Diff-based undo is a future optimisation if memory pressure becomes real.
- **Config as JSON in a `config` SQLite table.** Projects/work orders are relational rows in their own tables.

## Out of scope

- Glassmorphism / window transparency (Phase 2)
- Anchor corner positioning and display modes (Phase 2)
- Quick-capture autocomplete and slash commands (Phase 2)
- Overlapping block rendering (Phase 2)
- All external connectors — calendar, git, Jira, ADO (Phases 3–4)
- AI work order routing (Phase 5)
- Playwright submit flow (Phase 6)
- Electron Forge installer / auto-updater (Phase 7)
