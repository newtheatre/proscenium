/**
 * Display formatting for dates, times and money, with `en-GB` and
 * `Europe/London` fixed. The Worker runs in UTC, so an omitted `timeZone` is
 * an hour wrong for the whole of British Summer Time.
 *
 * In `app/utils/` rather than `shared/`, which is auto-imported into the
 * server build too — nothing server-side should be formatting for a UK reader.
 */

const TIME_ZONE = 'Europe/London'
const LOCALE = 'en-GB'

/** What we render when there is nothing to render. */
const EMPTY = '—'

/**
 * Coerce the several shapes a timestamp arrives in to a Date.
 * `performances.startsAt` is Unix **seconds**, while `createdAt` and friends
 * are SQLite `current_timestamp` strings. Forget the ×1000 and you get January
 * 1970 rather than an error, which is why this lives in one place.
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
 * `£12.50`. Takes **pence**, because money is stored as integer pence
 * everywhere in this codebase and converting earlier than the last possible
 * moment is how rounding errors get in (see docs/02-architecture.md).
 */
export function formatMoney(pence: number | null | undefined): string {
  if (pence === null || pence === undefined || Number.isNaN(pence)) return EMPTY
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

/** `1,304` — thousands separators for counts shown to a reader. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY
  return value.toLocaleString(LOCALE)
}
