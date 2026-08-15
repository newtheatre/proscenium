/**
 * Display formatting with `en-GB` and `Europe/London` fixed — the Worker runs
 * in UTC. In app/utils, not shared/, which is auto-imported server-side too.
 */

const TIME_ZONE = 'Europe/London'
const LOCALE = 'en-GB'

/** What we render when there is nothing to render. */
const EMPTY = '—'

/**
 * `performances.startsAt` is Unix seconds while `createdAt` is a SQLite
 * timestamp string; forgetting the ×1000 gives January 1970, not an error.
 */
export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date
    ? value
    : new Date(typeof value === 'number' ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** `14 Aug 2026, 19:30` — the default for anything with a time of day. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return EMPTY
  return date.toLocaleString(LOCALE, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** `14 Aug 2026` — for runs and issue dates, where the time is noise. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return EMPTY
  return date.toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** `19:30` — for doors and curtain, where the date is already established. */
export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return EMPTY
  return date.toLocaleTimeString(LOCALE, {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Takes **pence** — money is stored as integer pence everywhere, and converting
 * earlier than the last moment is how rounding errors start.
 */
export function formatMoney(pence: number | null | undefined): string {
  if (pence === null || pence === undefined || Number.isNaN(pence)) return EMPTY
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

/**
 * Thousands separators, for counts shown to a reader.
 */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY
  return value.toLocaleString(LOCALE)
}
