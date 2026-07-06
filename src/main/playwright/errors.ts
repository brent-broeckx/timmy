// src/main/playwright/errors.ts
// Typed error classes for all Playwright automation failures.
// Caught at the IPC boundary and surfaced to the user in plain language.

export class PlaywrightBaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

/** Session has expired — user needs to log in again. */
export class SessionExpiredError extends PlaywrightBaseError {
  constructor() {
    super(
      'Your session has expired. Please log in in the browser window that opened, then click Continue.',
    )
  }
}

/** The period input field could not be found or interacted with after retries. */
export class NavigationFailedError extends PlaywrightBaseError {
  constructor(public readonly weekLabel: string, detail?: string) {
    super(
      `Could not navigate to week ${weekLabel}. ` +
        (detail ?? '') +
        ' Please ask your developer to check the periodInputSelector in the connector config.',
    )
  }
}

/** A work order row could not be found in the table. */
export class RowNotFoundError extends PlaywrightBaseError {
  constructor(public readonly workOrderCode: string, public readonly weekLabel: string) {
    super(
      `Work order ${workOrderCode} was not found in the table for week ${weekLabel}. This entry was skipped.`,
    )
  }
}

/** A cell could not be interacted with. */
export class CellNotInteractableError extends PlaywrightBaseError {
  constructor(public readonly workOrderCode: string, public readonly date: string) {
    super(
      `Could not fill hours for work order ${workOrderCode} on ${date}. This entry was skipped.`,
    )
  }
}

/** The page structure has changed — selectors no longer match. */
export class PageStructureChangedError extends PlaywrightBaseError {
  constructor() {
    super(
      'The time registration tool may have changed. Please ask your developer to update the connector config.',
    )
  }
}

/** Generic timeout waiting for a Playwright action. */
export class PlaywrightTimeoutError extends PlaywrightBaseError {
  constructor(action: string) {
    super(`Timed out waiting for: ${action}. Check that the browser window is accessible.`)
  }
}

/** Submit was cancelled by the user. */
export class SubmitCancelledError extends PlaywrightBaseError {
  constructor() {
    super('Submit was cancelled.')
  }
}
