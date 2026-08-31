// Fixed-window counting, kept pure so the arithmetic is testable without a database.

export interface RateWindow {
  start: number
  resetsAt: number
}

// The window an instant falls in. Fixed rather than sliding: a sliding window needs a row per
// attempt, and this table is swept daily (docs/data-model.md).
export function windowFor(at: Date, seconds: number): RateWindow {
  const now = Math.floor(at.getTime() / 1000)
  const start = now - (now % seconds)
  return { start, resetsAt: start + seconds }
}

export interface RateVerdict {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function verdict(count: number, limit: number, window: RateWindow, at: Date): RateVerdict {
  const allowed = count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, window.resetsAt - Math.floor(at.getTime() / 1000)),
  }
}

// Buckets are keyed by what was submitted, not by what was found. Keying an account bucket on
// an account that exists would make being rate limited proof that it does.
export function bucketKey(scope: string, value: string): string {
  return `${scope}:${value.trim().toLowerCase()}`
}
