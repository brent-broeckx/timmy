// src/renderer/src/components/QuickCapture/suggestions.ts
// Pure ghost-text suggestion logic for the quick-capture bar.

/**
 * Returns the first recent task whose title starts with `input` (case-insensitive),
 * or null if no match or if the input starts with '/' (slash-command mode).
 */
export function findSuggestion(input: string, recents: string[]): string | null {
  if (!input || input.startsWith('/')) return null
  const lower = input.toLowerCase()
  return recents.find((r) => r.toLowerCase().startsWith(lower)) ?? null
}
