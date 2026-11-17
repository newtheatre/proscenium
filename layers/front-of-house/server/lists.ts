// What members read (FH-09, FH-17): open shifts, with why a person cannot take one; their own
// shifts and hours; and one shift with who else is on it. Reads by account go through the scope.
import { all, first, nowMs, theatreTimeZone, useSetting } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { accountLabel } from '#modules/core'
import { LIVE_STATES } from './db/schema'
import { getShift, type Shift } from './shifts'
import { eligibility, type Eligibility } from './assignments'

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')
const LIMIT = 200 // not-policy: a members' list of coming shifts, not a report

export interface OpenShift {
  id: string
  performanceId: string | null
  productionTitle: string | null
  title: string | null
  dutyId: string
  dutyName: string
  dutyDescription: string | null
  callAt: number
  endsAt: number
  placesFree: number
  /** An assignment whose holder asked to be released, when the shift needs cover. */
  coverFor: string | null
  eligible: boolean
  reasons: string[]
  unmet: Eligibility['unmet']
  /** The person is on another shift at that time. */
  overlaps: boolean
}

/** Published shifts that are open to sign-up and have a place free or need cover; cover first. */
export async function openShifts(accountId: string, filters: { productionId?: string, dutyId?: string, from?: number, to?: number } = {}): Promise<OpenShift[]> {
  const at = nowMs()
  const rows = await all<{ id: string, performance_id: string | null, production_title: string | null, title: string | null, duty_id: string, duty_name: string, description: string | null, requirements: string, call_at: number, ends_at: number, free: number, cover_for: string | null, mine: number, overlaps: number }>(
    `SELECT s.id, s.performance_id, p.title AS production_title, s.title, s.duty_id, d.name AS duty_name, d.description, d.requirements, s.call_at, s.ends_at,
        s.places - s.places_taken AS free,
        (SELECT a.id FROM front_of_house_assignments a WHERE a.shift_id = s.id AND a.state = 'release_requested' AND a.account_id NOT IN (${accountScopeSql('?1')}) ORDER BY a.updated_at LIMIT 1) AS cover_for,
        EXISTS (SELECT 1 FROM front_of_house_assignments a WHERE a.shift_id = s.id AND a.state IN (${live}) AND a.account_id IN (${accountScopeSql('?1')})) AS mine,
        EXISTS (SELECT 1 FROM front_of_house_assignments a JOIN front_of_house_shifts o ON o.id = a.shift_id
          WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${live}) AND o.id <> s.id AND o.call_at < s.ends_at AND o.ends_at > s.call_at) AS overlaps
       FROM front_of_house_shifts s JOIN front_of_house_duties d ON d.id = s.duty_id
       LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
      WHERE s.state = 'published' AND s.sign_up_closes_at > ?2 AND (?3 IS NULL OR f.production_id = ?3) AND (?4 IS NULL OR s.duty_id = ?4)  -- not-policy: numbered parameters
        AND s.call_at >= coalesce(?5, ?2) AND (?6 IS NULL OR s.call_at < ?6) -- not-policy: numbered parameters
      ORDER BY s.call_at LIMIT ?7 -- not-policy: numbered parameters
      `,
    accountId, at, filters.productionId ?? null, filters.dutyId ?? null, filters.from ?? null, filters.to ?? null, LIMIT)
  const open = rows.filter(r => !r.mine && (r.free > 0 || r.cover_for))
  // Each shift's requirements, checked at its own call time.
  const verdicts = new Map<string, Eligibility>()
  for (const r of open) {
    const refs = JSON.parse(r.requirements) as string[]
    if (refs.length) verdicts.set(r.id, await eligibility(accountId, { id: r.id, dutyId: r.duty_id, callAt: r.call_at }, refs))
  }
  return open.map(r => ({
    id: r.id, performanceId: r.performance_id, productionTitle: r.production_title, title: r.title, dutyId: r.duty_id, dutyName: r.duty_name,
    dutyDescription: r.description, callAt: r.call_at, endsAt: r.ends_at, placesFree: r.free, coverFor: r.cover_for,
    eligible: verdicts.get(r.id)?.met ?? true, reasons: verdicts.get(r.id)?.reasons ?? [], unmet: verdicts.get(r.id)?.unmet ?? [], overlaps: !!r.overlaps,
  })).sort((a, b) => Number(!!b.coverFor) - Number(!!a.coverFor) || a.callAt - b.callAt)
}

export interface MyShift { assignmentId: string, shiftId: string, state: string, performanceId: string | null, productionTitle: string | null, title: string | null, dutyName: string, callAt: number, endsAt: number, minutesWorked: number | null }

/** The person's coming shifts, then past ones, and their minutes worked this calendar year. */
export async function myShifts(accountId: string): Promise<{ coming: MyShift[], past: MyShift[], minutesThisYear: number }> {
  const at = nowMs()
  const rows = await all<{ id: string, shift_id: string, state: string, performance_id: string | null, production_title: string | null, title: string | null, duty_name: string, call_at: number, ends_at: number, window_closes_at: number, minutes_worked: number | null }>(
    `SELECT a.id, a.shift_id, a.state, s.performance_id, p.title AS production_title, s.title, d.name AS duty_name, s.call_at, s.ends_at, s.window_closes_at, a.minutes_worked
       FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
       LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
      WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state NOT IN ('declined', 'withdrawn')
      ORDER BY s.call_at DESC LIMIT ?2`,
    accountId, LIMIT)
  const map = (r: typeof rows[number]): MyShift => ({ assignmentId: r.id, shiftId: r.shift_id, state: r.state, performanceId: r.performance_id, productionTitle: r.production_title, title: r.title, dutyName: r.duty_name, callAt: r.call_at, endsAt: r.ends_at, minutesWorked: r.minutes_worked })
  const yearOf = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: await theatreTimeZone() })
  const year = yearOf.format(at)
  const inYear = (t: number) => yearOf.format(t) === year
  return {
    coming: rows.filter(r => r.window_closes_at >= at && (LIVE_STATES as readonly string[]).includes(r.state)).map(map).reverse(),
    past: rows.filter(r => r.window_closes_at < at || !(LIVE_STATES as readonly string[]).includes(r.state)).map(map),
    minutesThisYear: rows.filter(r => r.state === 'worked' && inYear(r.call_at)).reduce((sum, r) => sum + (r.minutes_worked ?? 0), 0),
  }
}

export interface ShiftView extends Shift {
  dutyDescription: string | null
  productionTitle: string | null
  venueName: string | null
  /** How long before the call a place can be given up without asking for cover, in seconds. */
  releaseNotice: number
  people: { name: string, state: string }[]
  mine: { assignmentId: string, state: string } | null
  /** Someone else's place that needs cover, which the person could take. */
  coverFor: string | null
}

/** One shift for a member: what it is, who else is on it (names only) and the person's own place. */
export async function shiftView(id: string, accountId: string): Promise<ShiftView | null> {
  const shift = await getShift(id)
  if (!shift || shift.state === 'draft') return null
  const people = await all<{ id: string, account_id: string, state: string, mine: number }>(
    `SELECT a.id, a.account_id, a.state, a.account_id IN (${accountScopeSql('?1')}) AS mine
       FROM front_of_house_assignments a WHERE a.shift_id = ?2 AND a.state IN (${live}) ORDER BY a.created_at`,
    accountId, id)
  const about = await first<{ description: string | null, production_title: string | null, venue_name: string | null }>(
    `SELECT d.description, p.title AS production_title, v.name AS venue_name FROM front_of_house_duties d
       LEFT JOIN core_performances f ON f.id = ?2 LEFT JOIN core_productions p ON p.id = f.production_id
       LEFT JOIN core_venues v ON v.id = coalesce(?3, f.venue_id) WHERE d.id = ?1 -- not-policy: numbered parameters
      `, shift.dutyId, shift.performanceId, shift.venueId)
  const mine = people.find(p => p.mine)
  return {
    ...shift,
    dutyDescription: about?.description ?? null,
    productionTitle: about?.production_title ?? null,
    venueName: about?.venue_name ?? null,
    releaseNotice: await useSetting('front-of-house.shifts.release-notice') as number,
    people: await Promise.all(people.filter(p => p.state !== 'requested').map(async p => ({ name: await accountLabel(p.account_id), state: p.state }))),
    mine: mine ? { assignmentId: mine.id, state: mine.state } : null,
    coverFor: people.find(p => p.state === 'release_requested' && !p.mine)?.id ?? null,
  }
}
