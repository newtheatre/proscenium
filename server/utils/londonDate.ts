/**
 * The calendar day in Europe/London. The Worker runs in UTC, so a 23:30 sale
 * in August is tomorrow unless this is used (ADR-0023).
 */
export function londonDate(now: Date = new Date()): string {
  // en-CA renders YYYY-MM-DD, which is what every DATE column here expects.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)
}

/**
 * A SQLite `current_timestamp` value as ISO. The column holds
 * `YYYY-MM-DD HH:MM:SS` in UTC with no zone marker, which Date parses as local.
 */
export function sqliteStampToIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(`${value.replace(' ', 'T')}Z`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}
