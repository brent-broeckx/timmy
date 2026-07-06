// src/main/playwright/connectors/company-timeregistration.ts
// Hardcoded connector configuration for the internal time registration tool.
//
// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER: Fill in every field below by inspecting the live tool in Chrome
// DevTools BEFORE running any automation. See AGENTS.md for the full step-by-
// step inspection guide. Nothing works correctly until this config is filled in.
//
// Quick checklist:
//   1. Open the tool in Chrome → F12 → Elements panel
//   2. Search for <iframe> — note selector chain → fill iframeChain
//   3. Switch DevTools context to the correct iframe
//   4. Find the YYYYWW input → fill periodInputSelector
//   5. Find table rows and WO identifier → fill row* fields
//   6. Find column headers, check date format → fill column* fields
//   7. Find hours input inside a cell → fill cellInputSelector
//   8. Find the save/submit button → fill submitButtonSelector
//   9. Decide reload detection strategy → fill tableReload* fields
//  10. Verify each selector with document.querySelector() in DevTools Console
// ─────────────────────────────────────────────────────────────────────────────

export const TIME_REG_CONFIG = {

  // ── URL ──────────────────────────────────────────────────────────────────
  // The URL of the time registration tool's main page (after login).
  // TODO: replace with the actual URL
  url: 'https://camis.cegeka.com/agresso/',

  // ── IFRAME CONFIGURATION ─────────────────────────────────────────────────
  // Chain of iframe CSS selectors from outermost to innermost.
  // Use [] if there are no iframes.
  // Use ['iframe#mainFrame'] for a single iframe with id="mainFrame".
  // Use ['iframe#outer', 'iframe#inner'] for nested iframes (outermost first).
  // TODO: fill in after inspecting the page in DevTools
  iframeChain: ['iframe'] as string[],

  // ── PERIOD INPUT ─────────────────────────────────────────────────────────
  // CSS selector for the input field that accepts the YYYYWW period value.
  // Relative to the innermost iframe (or top-level page if iframeChain is []).
  // TODO: fill in after inspecting the period/week input in DevTools
  periodInputSelector: 'input#b_s71_s84_s85_l84s85_ctl00_1548_Editor',

  // ── ADD ROW ───────────────────────────────────────────────────────────────
  // CSS selector for the toolbar button that adds a new blank row to the table.
  // Inspect the "Add" / "+" / "Insert" button in the timesheet toolbar.
  // In AGRESSO this is typically something like '#b$tblsysInsert'.
  // TODO: inspect the add/insert button in DevTools and fill in its selector
  addRowButtonSelector: '#b_s89_g89s90_buttons__newButton',

  // CSS selector for the work order input field inside a newly added row.
  // Evaluated relative to the row element (<tr>).
  // TODO: confirm the correct selector by inspecting a row's first input
  workOrderInputSelector: 'td.InputCell datalistcontrol[id^="b_s89_g89s90_row"][id$="_1574_Control"] input.slcEditor',

  // CSS selector for the description/text input inside a newly added row.
  // Evaluated relative to the row element (<tr>).
  // After the work order lookup the server pre-fills this field; we keep that
  // text and append " / " followed by the time-block title(s).
  // Set to '' to skip the description step entirely.
  // TODO: inspect the description input in DevTools and fill in its selector
  descriptionInputSelector: 'td.InputCell input[id^="b_s89_g89s90_row"][id$="_description_i"]',
  // CSS selector for all table row elements in the timesheet body.
  // Used to detect when a new row has been added after clicking addRowButtonSelector.
  rowSelector: 'table#b_s89_g89s90 > tbody tr',
  // ── COLUMN IDENTIFICATION ────────────────────────────────────────────────
  // CSS selector for all column header cells (th or td) in the timesheet table.
  // TODO: fill in after inspecting the table header in DevTools
  columnHeaderSelector: 'table#b_s89_g89s90 > thead tr th',

  // How dates appear in column headers. Inspect a header cell and pick the token
  // that matches what you see:
  //   'D'          → day without padding: 1, 2 … 31
  //   'DD'         → day with zero-padding: 01, 02 … 31
  //   'DD/MM'      → e.g. 14/07
  //   'DD-MM'      → e.g. 14-07
  //   'DD.MM'      → e.g. 14.07
  //   'DD/MM/YYYY' → e.g. 14/07/2026
  //   'MM/DD'      → e.g. 07/14 (zero-padded month)
  //   'M/D'        → e.g. 7/14 or 6/29 (no padding on either)
  columnDateFormat: 'M/D' as 'D' | 'DD' | 'DD/MM' | 'DD-MM' | 'DD.MM' | 'DD/MM/YYYY' | 'MM/DD' | 'M/D',

  // ── CELL INPUT ───────────────────────────────────────────────────────────
  // CSS selector for the hours input field inside a table cell.
  // Evaluated relative to the cell element (not the full page or frame).
  // Use ':scope' if the cell itself is the input (e.g. a contenteditable <td>).
  // TODO: fill in after inspecting a cell in DevTools
  cellInputSelector: 'input.Edit',

  // Selector template for the hours input by day-of-week position in a row.
  // Use {N} as a placeholder for the 1-based ISO day index (1=Mon … 7=Sun).
  // Evaluated relative to the row element (<tr>).
  // When set, this is used instead of scanning column headers by date text,
  // which is faster and more reliable for apps with predictable input IDs.
  // Set to '' to fall back to the column-header scanning approach.
  //
  // AGRESSO: input IDs follow the pattern
  //   b_s89_g89s90_row{R}_{X}_reg_value{N}_i
  // where {N} is the day index (value1 = Monday of the week).
  dayInputSelectorTemplate: 'input[id^="b_s89_g89s90_row"][id$="_reg_value{N}_i"]',

  // ── SUBMIT BUTTON ────────────────────────────────────────────────────────
  // CSS selector for the button that saves/submits the current week.
  // Relative to the innermost iframe (or top-level page if iframeChain is []).
  // TODO: fill in after inspecting the save/submit button in DevTools
  submitButtonSelector: '[id="b$tblsysSave"]',

  // ── TABLE RELOAD SIGNAL ───────────────────────────────────────────────────
  // After tabbing out of the period input the table reloads.
  // Playwright waits for this signal before reading or writing any cells.
  //
  //   'spinner-gone'    → wait for tableReloadSelector element to become hidden
  //   'element-visible' → wait for tableReloadSelector element to become visible
  //
  // Strategy B ('element-visible' + table body selector) is the safest default.
  // TODO: adjust if the tool uses a loading spinner instead
  tableReloadStrategy: 'element-visible' as 'spinner-gone' | 'element-visible',
  tableReloadSelector: 'table#b_s89_g89s90 > tbody',

  // ── TIMING (ms) ───────────────────────────────────────────────────────────
  // Settle delays added after server-triggered reloads / lookups.
  // Increase these if the automation moves faster than the server responds.
  timings: {
    // Wait after tabbing out of the period input, before adding any rows.
    afterPeriodInput: 1_000,
    // Wait after clicking the add-row button, before interacting with the new row.
    afterAddRow: 1_000,
    // Wait after tabbing out of the work order field, before filling description.
    afterWorkOrder: 1_000,
    // Wait before retrying a cell fill that failed the first time.
    cellFillRetry: 500
  }

} as const

export type TimeRegConfig = typeof TIME_REG_CONFIG
