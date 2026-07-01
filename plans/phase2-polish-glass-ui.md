# Phase 2 — Polish & Glass UI

**Status:** Implemented ✅ — 28/28 tests passing

---

## Plan: Phase 2 — Polish & Glass UI

**Summary**

Phase 2 transforms Timmy from a functional MVP into a product that feels premium and intentional. It has five independent workstreams: glassmorphism window treatment, anchor widget corner positioning with display modes, overlay/block/toast animations, quick-capture autocomplete with a slash command system, and overlapping block rendering. The workstreams can largely be parallelized — the only dependency is that anchor corner direction must be confirmed before implementing overlay slide-in animations, since the animation direction depends on the anchor's screen position.

The most consequential architectural decision (resolved below) is whether the anchor widget lives in a **third BrowserWindow** or whether the overlay window repositions to the configured corner. The plan recommends a third window — see the Decision section.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `backgroundMaterial: 'acrylic'` is Windows 11 only | High | Med | Ship CSS-only fallback (`rgba` + `backdrop-filter` within the page) first; layer Acrylic on top for Win11 |
| Electron `transparent: true` causes click-through on transparent areas | Med | High | Set `setIgnoreMouseEvents(false)` explicitly; test all interactive regions |
| Third BrowserWindow adds IPC complexity for `STATE_TASK_CHANGED` push | Med | Med | Extend the existing `windows.ts` registry; reuse the existing push pattern |
| Ghost-text autocomplete conflicts with slash command parsing in the same input | Med | Med | Parse slash commands before ghost-text logic; ghost-text only activates when no `/` prefix is present |
| Tab key for autocomplete conflicts with natural focus-trap in the quick-capture window | Low | Med | Intercept Tab in `onKeyDown` before any focus-trap library logic; no focus-trap is in use currently |
| Overlapping block layout breaks single-block layout (regression) | Low | Med | Column count = 1 is the identity case; existing render path unchanged when no overlap detected |

---

## Key Architectural Decision: Anchor Window

### Option A — Separate `anchorWindow` BrowserWindow (recommended)
A third small BrowserWindow (~200×44, `alwaysOnTop: true`, `transparent: true`, `frame: false`, `skipTaskbar: true`, `focusable: false`). Loads the renderer at `?window=anchor`. The overlay window is independently shown/hidden and positions itself based on the configured corner — it is _not_ embedded in the anchor window.

**Pros:** Anchor is always visible (even when overlay is hidden), which is the product vision. "Hide anchor" mode simply hides this window and uses tray-only. Smart open direction is just a positional calculation at `overlayWindow.show()` time. Follows the existing two-window pattern cleanly.

**Cons:** Third window increases startup overhead slightly. Requires a new renderer route, new entries in `windows.ts`, one new IPC push channel to keep anchor in sync.

### Option B — Overlay positioned at corner (no new window)
The overlay window (960×700) repositions itself to the user-configured corner when shown. The `AnchorWidget` is already at the top of the panel, so it naturally appears in that corner. No separate anchor window.

**Pros:** No new BrowserWindow. Simpler.

**Cons:** Anchor is invisible when overlay is hidden. Users cannot glance at the running task without opening the overlay — this breaks the core use-case of a persistent awareness widget. "Tray-only mode" already exists. Does not fulfil the ROADMAP spec.

**Decision: Option A.** The whole point of the anchor widget is always-visible task awareness. Option B degrades that to a glorified tray tooltip.

---

## Phase A: Glassmorphism Window Treatment

**Goal:** The overlay window and quick-capture bar have a frosted-glass appearance. A settings control lets the user configure intensity (0–100). Verify by toggling intensity in settings and confirming the overlay blurs its background content.

### Steps

1. **Establish defaults** — Confirm `AppConfig` defaults in `db.ts` for `glassIntensity` (suggest `60`) and `theme` (`'dark'`). Add them to the config migration if absent.

2. **Enable OS-level transparency on `overlayWindow`** — In `src/main/index.ts`, change `overlayWindow` from `transparent: false, backgroundColor: '#0f0f1a'` to `transparent: true, backgroundColor: '#00000000'`. On Windows 11, also set `backgroundMaterial: 'acrylic'` (Electron 36+ API). Wrap in a runtime check: `process.platform === 'win32' && parseInt(os.release()) >= 10` to guard Win10 fallback. `quickCaptureWindow` is already transparent — no change needed there.

3. **CSS glass tokens** — In `src/renderer/src/styles/index.css`, add to `@theme {}`:
   - `--glass-bg-opacity: 0.82` (will be overridden at runtime via CSS variable)
   - `--glass-blur: 12px`
   - `--glass-border-opacity: 0.12`
   A new `.glass-panel` utility class applies `background: rgba(15,15,26,var(--glass-bg-opacity))`, `backdrop-filter: blur(var(--glass-blur))`, and `border: 1px solid rgba(255,255,255,var(--glass-border-opacity))`.

4. **Apply glass to overlay root** — `OverlayPanel.tsx` root `<div>` gains the `glass-panel` class. Remove the opaque `bg-surface` from the title bar — replace with a matching semi-transparent tint. The `background-color: #0f0f1a` on `<body>` changes to `transparent`.

5. **Wire `glassIntensity` config to CSS** — In `OverlayPanel.tsx`, read `config.glassIntensity` from `useConfigStore` and inject it as an inline CSS variable: `style={{ '--glass-bg-opacity': 1 - (glassIntensity / 100) * 0.5 }}`. Higher intensity = more blur + less opaque background.

6. **Light/dark theme toggle** — `AppConfig.theme` is already typed as `'dark' | 'light'`. Add a `data-theme` attribute on `<html>` driven by `config.theme`. Define a `[data-theme="light"]` overrides block in `index.css` with inverted token values.

7. **Settings UI** — Add a "Appearance" section in `WorkOrderSettings.tsx` (or extract a `AppearanceSettings.tsx` component and add a new tab to `OverlayPanel`) with:
   - Glass intensity slider (0–100), debounced `updateConfig`
   - Dark/Light theme radio buttons

**Relevant files**
- [src/main/index.ts](../src/main/index.ts) — `transparent`, `backgroundColor`, `backgroundMaterial` on `overlayWindow`
- [src/renderer/src/styles/index.css](../src/renderer/src/styles/index.css) — new glass tokens + `.glass-panel`
- [src/renderer/src/components/Overlay/OverlayPanel.tsx](../src/renderer/src/components/Overlay/OverlayPanel.tsx) — apply glass class, inject CSS variable
- [src/renderer/src/components/Settings/WorkOrderSettings.tsx](../src/renderer/src/components/Settings/WorkOrderSettings.tsx) — appearance settings section
- [src/renderer/src/store/useConfigStore.ts](../src/renderer/src/store/useConfigStore.ts) — read `glassIntensity`, `theme`
- [shared/types.ts](../shared/types.ts) — verify `glassIntensity`, `theme` defaults

**Verification**
1. Run `npm run dev`, open overlay, confirm it is visually translucent (can see desktop through it)
2. Change glass intensity to 0 — overlay should be nearly opaque. Set to 100 — nearly transparent with maximum blur
3. Toggle theme — confirm token colors invert without a full reload
4. Run `npm run typecheck` — no errors

---

## Phase B: Anchor Widget — Full Implementation

**Goal:** A persistent small widget lives at the configured screen corner, always showing the current task or idle state. Clicking it opens/closes the overlay. Display mode and corner are configurable in settings. Verify by changing corner in settings, reopening the app, and confirming widget appears at the new corner.

### Steps

1. **New renderer route** — In `src/renderer/src/App.tsx`, add a branch for `?window=anchor` that renders the new `AnchorWidget` (extracted as a standalone root component — see step 3).

2. **Create `anchorWindow` in main** — In `src/main/index.ts`, create a new `BrowserWindow`:
   - Size: `200 × 44` (full mode) — will need to resize dynamically for dot-only (`44 × 44`)
   - `frame: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`, `focusable: false`, `resizable: false`
   - Loads renderer at `/?window=anchor`
   - Position computed from `config.anchorPosition` at startup (see step 5)
   - Register in `windows.ts`: `setAnchorWindow(w)` / `getAnchorWindow()`

3. **Extract standalone `AnchorWidget` component** — The current `AnchorWidget.tsx` is embedded inside `OverlayPanel` as a header row. Refactor:
   - Extract the full-screen anchor render into a standalone root component (`AnchorRoot.tsx` or update `AnchorWidget.tsx` with a `standalone` prop)
   - Add onClick: `ipc.window.toggleOverlay()` (IPC already exists: `window:toggleOverlay`)
   - Style as a floating pill/bar appropriate for a corner widget (not a full-width header)
   - The version inside `OverlayPanel` becomes a simplified non-interactive display strip (no click handler, no settings gear — those move to overlay panel header)
   - Add display mode logic: `anchorMode === 'dot-only'` → show only the pulsing dot circle; `anchorMode === 'hidden'` → `ipc.window.hideAnchor()` (new send channel)

4. **Push anchor updates** — When a task starts/stops, `src/main/ipc/storage.ts` already sends `STATE_TASK_CHANGED` to the overlay window. Add `getAnchorWindow()?.webContents.send(IPC.STATE_TASK_CHANGED)` in the same two places so the anchor window re-renders. No new IPC channel needed — the anchor window listens to the same push channel.

5. **Corner positioning logic** — Add a helper `getAnchorPosition(corner, screenSize, windowSize)` in `src/main/index.ts` that returns `{x, y}`:
   - `TL` → `(8, 8)`
   - `TR` → `(screenW - windowW - 8, 8)`
   - `BL` → `(8, screenH - windowH - 8)`
   - `BR` → `(screenW - windowW - 8, screenH - windowH - 8)`
   Call this on `anchorWindow` creation and whenever `config.anchorPosition` changes (listen for `CONFIG_SET` in main, or expose a dedicated `WINDOW_REPOSITION_ANCHOR` IPC send channel).

6. **Overlay smart open direction** — When `overlayWindow.show()` is called, compute where to position the overlay relative to the anchor corner. The overlay should open toward the screen center:
   - `TL` anchor → overlay at `(anchorX, anchorY + anchorH + 4)`
   - `TR` anchor → overlay at `(anchorX + anchorW - overlayW, anchorY + anchorH + 4)`
   - `BL` anchor → overlay at `(anchorX, anchorY - overlayH - 4)`
   - `BR` anchor → overlay at `(anchorX + anchorW - overlayW, anchorY - overlayH - 4)`
   Call `overlayWindow.setPosition(x, y)` before `overlayWindow.show()`.

7. **Settings UI** — In the Appearance section (Phase A), add:
   - Corner selector (2×2 grid of buttons: TL / TR / BL / BR)
   - Display mode selector: Full / Dot only / Hidden (tray only)
   - Both call `ipc.config.set(...)` and trigger reposition

8. **IPC additions required:**
   - Add `WINDOW_HIDE_ANCHOR` to `shared/types.ts` IPC constants, `SEND_CHANNELS` in preload, `ipcMain.on` handler in main, and `ipc.window.hideAnchor()` in `src/renderer/src/ipc/index.ts`
   - Add `WINDOW_REPOSITION_ANCHOR` send channel following the same pattern

**Relevant files**
- [src/main/index.ts](../src/main/index.ts) — new `anchorWindow`, positioning logic
- [src/main/windows.ts](../src/main/windows.ts) — `setAnchorWindow` / `getAnchorWindow`
- [src/renderer/src/App.tsx](../src/renderer/src/App.tsx) — new `?window=anchor` route
- [src/renderer/src/components/Anchor/AnchorWidget.tsx](../src/renderer/src/components/Anchor/AnchorWidget.tsx) — standalone root mode + display modes
- [src/renderer/src/components/Overlay/OverlayPanel.tsx](../src/renderer/src/components/Overlay/OverlayPanel.tsx) — remove anchor header; keep simplified task display row
- [src/renderer/src/ipc/index.ts](../src/renderer/src/ipc/index.ts) — `hideAnchor()`, `repositionAnchor()`
- [src/preload/index.ts](../src/preload/index.ts) — new send channels in `SEND_CHANNELS`
- [shared/types.ts](../shared/types.ts) — new IPC constants

**Verification**
1. App starts — anchor widget appears at top-left corner (default position)
2. Change corner to BR in settings — widget repositions to bottom-right
3. Open overlay — it appears adjacent to anchor, expanding toward screen center
4. Set mode to "Dot only" — widget shrinks to a 44×44 circle showing pulse/idle dot
5. Set mode to "Hidden" — widget disappears, tray icon remains
6. Run `npm run typecheck`

---

## Phase C: Animations

**Goal:** The overlay panel slides in/out from the anchor corner smoothly. Blocks animate on add/remove. The soft-delete toast slides up on enter and fades out on exit. No new dependencies — CSS transitions only.

### Steps

1. **Overlay slide-in/out** — The overlay window itself cannot animate natively in Electron without resize tricks. Instead, apply a CSS entry animation on the root `<div>` in `OverlayPanel.tsx`:
   - On mount, add a `data-direction` attribute based on the anchor corner config (e.g., `data-direction="from-tl"`)
   - Define `@keyframes` in `index.css`: `from-tl` slides in from top-left (`translateX(-20px) translateY(-20px) opacity 0`), etc.
   - The animation plays every time the component mounts (i.e., every time the window is shown, since `transparent: true` windows don't un-mount on hide, but the animation can be triggered by adding/removing a CSS class on visibility via Electron's `show`/`hide` events pushed to renderer via a new push channel `STATE_OVERLAY_VISIBILITY`)

2. **Block enter/exit transitions** — In `Timeline.tsx`, wrap the block list in a keyed render. Give `TimeBlock` a CSS class that transitions `opacity` and `transform` on mount:
   - New block: fade in + slide up `(translateY(8px) → translateY(0), opacity 0 → 1)` over 150ms
   - Deleted block (soft-delete): fade out + scale down over 200ms before the DOM element is removed
   - Implement via a `data-animating-in` / `data-animating-out` attribute + CSS transitions; no animation library needed

3. **SoftDeleteToast entrance/exit** — In `SoftDeleteToast.tsx`:
   - Entrance: `translateY(24px) → translateY(0)` + `opacity 0 → 1` on mount (100ms)
   - Exit: reverse on `onConfirm` (fade out before calling the parent callback)
   - Use a local `isExiting` state; on confirm trigger, set `isExiting = true`, wait 200ms, then call `onConfirm()`

4. **Anchor pulsing dot enhancement** — Replace `animate-pulse` (Tailwind's generic opacity pulse) with a custom `@keyframes ring-pulse` that emits a subtle expanding ring in the accent color — similar to a sonar ping. Define in `index.css`.

**Relevant files**
- [src/renderer/src/styles/index.css](../src/renderer/src/styles/index.css) — new keyframes for slide-in, ring-pulse
- [src/renderer/src/components/Overlay/OverlayPanel.tsx](../src/renderer/src/components/Overlay/OverlayPanel.tsx) — entry animation
- [src/renderer/src/components/Timeline/Timeline.tsx](../src/renderer/src/components/Timeline/Timeline.tsx) — block enter/exit transitions
- [src/renderer/src/components/Timeline/TimeBlock.tsx](../src/renderer/src/components/Timeline/TimeBlock.tsx) — transition classes
- [src/renderer/src/components/Timeline/SoftDeleteToast.tsx](../src/renderer/src/components/Timeline/SoftDeleteToast.tsx) — entrance/exit with `isExiting` state
- [src/renderer/src/components/Anchor/AnchorWidget.tsx](../src/renderer/src/components/Anchor/AnchorWidget.tsx) — ring-pulse keyframe reference

**Verification**
1. Open overlay — it slides in from the configured corner direction
2. Start a task — new block fades into the timeline
3. Delete a block — block fades out before toast appears
4. Wait 4s — toast slides down and fades out
5. Running task anchor dot emits a subtle ring pulse

---

## Phase D: Quick-Capture Autocomplete + Slash Commands

**Goal:** Typing in the quick-capture bar surfaces a ghost-text suggestion from recent tasks. Typing `/` activates the slash command menu. `/reuse`, `/stop`, `/note` commands are functional. Tab accepts a suggestion. Verify by typing the first two characters of a previous task and confirming ghost-text appears; press Tab to accept.

### Steps

1. **Load `recentTasks` on mount** — In `QuickCaptureBar.tsx`, call `useTaskStore((s) => s.loadRecent)` in a `useEffect` on component mount (or when the window becomes visible). `recentTasks` is already in `useTaskStore`.

2. **Ghost-text suggestion engine** — A pure function `findSuggestion(input: string, recents: string[]): string | null` in a new file `src/renderer/src/components/QuickCapture/suggestions.ts`:
   - If `input` starts with `/`, return `null` (slash command mode takes over)
   - Otherwise, find the first item in `recents` that starts with `input` (case-insensitive)
   - Return the full string so the UI can display the ghost suffix

3. **Ghost-text rendering** — In `QuickCaptureBar.tsx`, render the suggestion as a visually overlaid element:
   - Absolute-positioned `<span>` behind the `<input>` text, showing `input + ghost_suffix` in `text-text-muted` opacity
   - The real input has a transparent background and sits on top
   - Tab key in `onKeyDown`: if suggestion exists, set `value = suggestion`, prevent default

4. **"Did you mean?" suggestion below bar** — If `findSuggestion` returns a result, render a subtle pill below the input bar: `"↩ Tab to use: {suggestion}"`. Disappears on dismiss or when suggestion is null.

5. **Slash command registry** — New file `src/renderer/src/components/QuickCapture/commands.ts`:
   ```
   type SlashCommand = {
     name: string           // e.g. 'reuse'
     description: string    // shown in picker UI
     execute: (arg: string, context: CommandContext) => void
   }
   ```
   Register: `/reuse <name>`, `/stop`, `/note <text>`. The registry is a simple array — no reflection, no dynamic loading.

6. **Slash command UI** — When `value` starts with `/`, replace ghost-text logic with a command picker:
   - Filter `commands` by prefix of current input
   - Show a small dropdown above/below the input (position depends on anchor corner config) listing matching commands with descriptions
   - Arrow keys navigate, Tab/Enter selects + fills the command name
   - Space after a complete command name locks in the command and moves focus to the argument portion

7. **Command implementations:**
   - `/reuse <name>`: Opens autocomplete filtered to matching recent tasks; on Enter, starts that exact task title via `startTask(title)` then `dismiss()`
   - `/stop`: Calls `stopTask()` directly in the renderer store (no argument needed), then `dismiss()`
   - `/note <text>`: Deferred UX — in Phase 2, just prepend `[note]` to a new task entry; a proper "attach note to running task" requires a new IPC channel (`TASK_ADD_NOTE`) and a new DB column — if this complexity is undesirable, drop `/note` from Phase 2 and add it in Phase 3. Flag as a decision.

8. **Keyboard interactions summary:**
   - `Tab` — accept ghost-text suggestion OR select highlighted command
   - `ArrowUp/Down` — navigate command picker (when open)
   - `Escape` — close command picker first, then dismiss if already closed
   - `Enter` — execute selected command or start plain task

**Relevant files**
- [src/renderer/src/components/QuickCapture/QuickCaptureBar.tsx](../src/renderer/src/components/QuickCapture/QuickCaptureBar.tsx) — main integration point
- `src/renderer/src/components/QuickCapture/suggestions.ts` — new: ghost-text logic
- `src/renderer/src/components/QuickCapture/commands.ts` — new: slash command registry
- [src/renderer/src/store/useTaskStore.ts](../src/renderer/src/store/useTaskStore.ts) — `recentTasks`, `loadRecent`, `stopTask`
- [shared/types.ts](../shared/types.ts) — potentially new `TASK_ADD_NOTE` channel (if `/note` is in scope)
- [src/main/ipc/storage.ts](../src/main/ipc/storage.ts) — `TASK_ADD_NOTE` handler (if `/note` in scope)

**Verification**
1. Start the app, trigger quick-capture (`Ctrl+Shift+Space`)
2. Type 2 characters matching a previous task — ghost-text appears
3. Press Tab — input fills with the full suggestion
4. Press Enter — task starts, window closes
5. Open quick-capture again, type `/` — command picker opens with 2–3 commands
6. Select `/stop` — current task stops, window closes
7. Run `npm run typecheck`

---

## Phase E: Overlapping Block Support

**Goal:** When two timeline blocks share overlapping time ranges, they render side-by-side rather than stacking. Visual indicator shows full overlaps. Verify by manually creating two overlapping blocks in tests and confirming side-by-side layout.

### Steps

1. **Overlap detection algorithm** — New pure function `computeLayout(blocks: TimeBlock[]): LayoutBlock[]` in `src/renderer/src/components/Timeline/layout.ts`:
   - `LayoutBlock = TimeBlock & { columnIndex: number; totalColumns: number }`
   - Sort blocks by `startTime` ascending
   - Use an interval graph coloring algorithm: for each block, find the first column not occupied by a block that overlaps it
   - Two blocks overlap if `a.startTime < b.endTime && b.startTime < a.endTime` (half-open interval comparison)
   - Running blocks (`endTime === null`) treat their end as `now` for overlap detection
   - Return all blocks annotated with `columnIndex` and `totalColumns` (max column count within each overlap group)

2. **Wire layout into Timeline** — In `Timeline.tsx`, replace `blocks.map(...)` with `computeLayout(blocks).map(...)`. Pass `columnIndex` and `totalColumns` as new props to `TimeBlock`.

3. **TimeBlock side-by-side layout** — `TimeBlock.tsx` receives `columnIndex: number` and `totalColumns: number` props. Apply inline width and left offset:
   - `width: calc(100% / totalColumns)`
   - `marginLeft: calc(100% * columnIndex / totalColumns)`
   - When `totalColumns === 1`, this is a no-op (full-width, no offset) — preserves existing behaviour

4. **Full overlap visual indicator** — If two blocks have identical `startTime` and `endTime`, add a `⚠` badge or a coloured left-border stripe on each to indicate "full overlap". Add a tooltip: "This block fully overlaps with another".

5. **Tests** — Add unit tests for `computeLayout` in `src/renderer/src/components/Timeline/__tests__/layout.test.ts` covering: no overlap (identity), partial overlap (2 columns), triple overlap (3 columns), full overlap detection.

**Relevant files**
- `src/renderer/src/components/Timeline/layout.ts` — new: overlap computation
- [src/renderer/src/components/Timeline/Timeline.tsx](../src/renderer/src/components/Timeline/Timeline.tsx) — use `computeLayout`, pass new props
- [src/renderer/src/components/Timeline/TimeBlock.tsx](../src/renderer/src/components/Timeline/TimeBlock.tsx) — accept + apply layout props
- `src/renderer/src/components/Timeline/__tests__/layout.test.ts` — new unit tests

**Verification**
1. `npm run test` — new layout tests pass, existing 20 tests still pass
2. Manually create two overlapping blocks in the app — they appear side by side
3. A block with no overlap renders at full width (no regression)

---

## Decisions

- **No animation library (Framer Motion)**: CSS transitions are sufficient for all Phase 2 animations. Avoids adding a 200KB+ dependency for effects achievable with keyframes. If Phase 3 requires orchestrated enter/exit sequences for calendar event imports, revisit.
- **`/note` command scope**: If attaching notes to a running task requires a new DB column + IPC channel, consider deferring to Phase 3 where other DB schema changes (calendar event columns) will occur. Cost of `/note` in isolation is a full IPC round-trip addition. Mark as an explicit scoping decision before implementation begins.
- **Win10 glassmorphism fallback**: On Windows 10 (no `backgroundMaterial: 'acrylic'`), the app falls back to CSS `backdrop-filter` within the page. This blurs page elements behind panels (not the OS desktop). The effect is subtle but acceptable. No separate Win10-specific code path needed beyond a runtime guard.
- **`anchorWindow` resize for display modes**: Full mode = 200×44, dot-only mode = 44×44. Use `anchorWindow.setSize(w, h)` when mode changes. The renderer re-renders with the new mode; no layout shift in the overlay panel.

---

## Out of Scope (Phase 2)

- Playwright auto-submit (Phase 6)
- Calendar/connector integrations (Phase 3)
- AI work order routing (Phase 5)
- Multi-select on timeline blocks
- Weekly summary view
- Export / reporting
- Any change to the SQLite schema unless `/note` is confirmed in scope

---

## Sequencing Summary

| Phase | Depends on | Can parallelize with |
|-------|-----------|---------------------|
| A — Glassmorphism | nothing | D, E, F |
| B — Anchor Widget | nothing (but should confirm architecture first) | A, D, E, F |
| C — Animations | B (need corner direction for slide-in) | D, E, F |
| D — Autocomplete + Slash | nothing | A, B, E, F |
| E — Overlapping Blocks | nothing | A, B, C, D, F |
| F — Toast Polish | nothing | A, B, C, D, E |

Recommended implementation order: **D and E first** (zero architectural risk, deliver visible value, buildable in isolation), then **A** (glassmorphism), then **B** (anchor window architecture), then **C** (animations, which now has anchor direction confirmed).
