// The date rules (Membership specification, tab 3, D1 and D6 to D8). Every date is a local date,
// 'YYYY-MM-DD', in the theatre's time zone; nothing here reads the clock, so each rule can be tested
// on its own.

const pad = (n: number, width = 2) => String(n).padStart(width, '0')
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`
const parts = (date: string): [number, number, number] => date.split('-').map(Number) as [number, number, number]
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** A local date moved by whole days. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export interface LengthRule {
  lengthRule: 'fixed' | 'rolling' | 'indefinite'
  fixedEndMonth?: number | null
  fixedEndDay?: number | null
  rolloverDays?: number | null
}

/**
 * The end date of a membership that starts on `startsOn` and is held for `count` of the scheme's
 * units: scheme years for a fixed scheme, months for a rolling one (D8). Null for an indefinite
 * scheme, which ends only when somebody ends it.
 */
export function endsOnFor(scheme: LengthRule, startsOn: string, count = 1): string | null {
  const [y, m, d] = parts(startsOn)
  if (scheme.lengthRule === 'indefinite') return null
  if (scheme.lengthRule === 'rolling') {
    const months = m - 1 + count
    const ty = y + Math.floor(months / 12) // not-policy: months in a year
    const tm = (months % 12) + 1 // not-policy: months in a year
    // A start on the 31st into a shorter month ends on that month's last day.
    if (d > daysIn(ty, tm)) return iso(ty, tm, daysIn(ty, tm))
    return addDays(iso(ty, tm, d), -1)
  }
  const em = scheme.fixedEndMonth!
  const ed = scheme.fixedEndDay!
  // The next occurrence of the end date on or after the start.
  let ey = iso(y, em, ed) >= startsOn ? y : y + 1
  // Within the rollover days of the start, the membership runs to the following year's end.
  if (addDays(startsOn, scheme.rolloverDays ?? 0) >= iso(ey, em, ed) && (scheme.rolloverDays ?? 0) > 0) ey += 1
  return iso(ey + count - 1, em, ed)
}

export type DerivedStatus = 'upcoming' | 'current' | 'in-grace' | 'lapsed'

/** D1: what an active membership is today. Current and in grace both count as holding the scheme. */
export function derivedStatus(m: { startsOn: string, endsOn: string | null }, graceDays: number, today: string): DerivedStatus {
  if (today < m.startsOn) return 'upcoming'
  if (m.endsOn === null || today <= m.endsOn) return 'current'
  if (today <= addDays(m.endsOn, graceDays)) return 'in-grace'
  return 'lapsed'
}

export const holdsCurrently = (status: DerivedStatus) => status === 'current' || status === 'in-grace'
