/**
 * The calendar day in Europe/London. The Worker runs in UTC, so a 23:30 sale
 * in August is tomorrow unless this is used (ADR-0023).
 */
export function londonDate(now: Date = new Date()): string {
  // en-CA renders YYYY-MM-DD, which is what every DATE column here expects.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)
}

/** Pence as a readable figure, for messages a human reads mid-transaction. */
export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}
