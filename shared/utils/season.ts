/**
 * The theatre's season runs 1 August to 31 July, matching the university year
 * and the committee handover. One rule, so the server and the admin export agree.
 */

/** The season covering an instant, as inclusive `YYYY-MM-DD` bounds. */
export function seasonBounds(now: Date = new Date()): { from: string, to: string } {
  // Europe/London, never UTC or the reader's own zone: at 00:30 BST on 1 August
  // both still read 31 July, which resolves to the season that has just ended.
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' })
    .format(now).split('-').map(Number) as [number, number]
  const startYear = month >= 8 ? year : year - 1
  return { from: `${startYear}-08-01`, to: `${startYear + 1}-07-31` }
}
