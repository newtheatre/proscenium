// What members read (FH-09, FH-17): open shifts, with why a person cannot take one; their own
// shifts and hours; and one shift with who else is on it. Reads by account go through the scope.
import { all, first, nowMs, theatreTimeZone, useSetting } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { accountLabel } from '#modules/core'
import { LIVE_STATES } from './db/schema'
import { getShift, type Shift } from './shifts'
import { eligibility, type Eligibility } from './assignments'
import { calendarKey } from './words'

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
  /** The performance's start, so a matinee and an evening can be told apart. */
  curtainAt: number | null
  placesFree: number
  /** An assignment whose holder asked to be released, when the shift needs cover. */
  coverFor: string | null
  eligible: boolean
  reasons: string[]
  unmet: Eligibility['unmet']
  /** The person is on another shift at that time. */
  overlaps: boolean
  /** That other shift, for saying which one. */
  clash: Clash | null
}

/** A shift the person already has, named so a screen can say which one clashes. */
export interface Clash { shiftId: string, dutyName: string, productionTitle: string | null, title: string | null, callAt: number, endsAt: number }

/** The person's live shifts that have not yet ended. */
async function liveClashes(accountId: string): Promise<Clash[]> {
  const rows = await all<{ shift_id: string, duty_name: string, production_title: string | null, title: string | null, call_at: number, ends_at: number }>(
    `SELECT s.id AS shift_id, d.name AS duty_name, p.title AS production_title, s.title, s.call_at, s.ends_at
       FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
       LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
      WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${live}) AND s.ends_at > ?2 ORDER BY s.call_at LIMIT ?3`, // not-policy: numbered parameters
    accountId, nowMs(), LIMIT)
  return rows.map(r => ({ shiftId: r.shift_id, dutyName: r.duty_name, productionTitle: r.production_title, title: r.title, callAt: r.call_at, endsAt: r.ends_at }))
}

const clashing = (clashes: Clash[], shift: { id: string, callAt: number, endsAt: number }): Clash | null =>
  clashes.find(c => c.shiftId !== shift.id && c.callAt < shift.endsAt && c.endsAt > shift.callAt) ?? null

/** Published shifts that are open to sign-up and have a place free or need cover; cover first. */
export async function openShifts(accountId: string, filters: { productionId?: string, dutyId?: string, from?: number, to?: number } = {}): Promise<OpenShift[]> {
  const at = nowMs()
  const rows = await all<{ id: string, performance_id: string | null, production_title: string | null, title: string | null, duty_id: string, duty_name: string, description: string | null, requirements: string, call_at: number, ends_at: number, curtain_at: number | null, free: number, cover_for: string | null, mine: number }>(
    `SELECT s.id, s.performance_id, p.title AS production_title, s.title, s.duty_id, d.name AS duty_name, d.description, d.requirements, s.call_at, s.ends_at, f.starts_at AS curtain_at,
        s.places - s.places_taken AS free,
        (SELECT a.id FROM front_of_house_assignments a WHERE a.shift_id = s.id AND a.state = 'release_requested' AND a.account_id NOT IN (${accountScopeSql('?1')}) ORDER BY a.updated_at LIMIT 1) AS cover_for,
        EXISTS (SELECT 1 FROM front_of_house_assignments a WHERE a.shift_id = s.id AND a.state IN (${live}) AND a.account_id IN (${accountScopeSql('?1')})) AS mine
       FROM front_of_house_shifts s JOIN front_of_house_duties d ON d.id = s.duty_id
       LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
      WHERE s.state = 'published' AND s.sign_up_closes_at > ?2 AND (?3 IS NULL OR f.production_id = ?3) AND (?4 IS NULL OR s.duty_id = ?4)  -- not-policy: numbered parameters
        AND s.call_at >= coalesce(?5, ?2) AND (?6 IS NULL OR s.call_at < ?6) -- not-policy: numbered parameters
      ORDER BY s.call_at LIMIT ?7 -- not-policy: numbered parameters
      `,
    accountId, at, filters.productionId ?? null, filters.dutyId ?? null, filters.from ?? null, filters.to ?? null, LIMIT)
  const open = rows.filter(r => !r.mine && (r.free > 0 || r.cover_for))
  const clashes = await liveClashes(accountId)
  // Each shift's requirements, checked at its own call time.
  const verdicts = new Map<string, Eligibility>()
  for (const r of open) {
    const refs = JSON.parse(r.requirements) as string[]
    if (refs.length) verdicts.set(r.id, await eligibility(accountId, { id: r.id, dutyId: r.duty_id, callAt: r.call_at }, refs))
  }
  return open.map((r) => {
    const clash = clashing(clashes, { id: r.id, callAt: r.call_at, endsAt: r.ends_at })
    return {
      id: r.id, performanceId: r.performance_id, productionTitle: r.production_title, title: r.title, dutyId: r.duty_id, dutyName: r.duty_name,
      dutyDescription: r.description, callAt: r.call_at, endsAt: r.ends_at, curtainAt: r.curtain_at, placesFree: r.free, coverFor: r.cover_for,
      eligible: verdicts.get(r.id)?.met ?? true, reasons: verdicts.get(r.id)?.reasons ?? [], unmet: verdicts.get(r.id)?.unmet ?? [], overlaps: !!clash, clash,
    }
  }).sort((a, b) => a.callAt - b.callAt)
}

export interface MyShift { assignmentId: string, shiftId: string, state: string, performanceId: string | null, productionTitle: string | null, title: string | null, dutyName: string, callAt: number, endsAt: number, minutesWorked: number | null }

/** The person's coming shifts, then past ones, and their minutes worked this calendar year. */
export async function myShifts(accountId: string): Promise<{ coming: MyShift[], givenUp: MyShift[], past: MyShift[], minutesThisYear: number }> {
  const at = nowMs()
  const rows = await all<{ id: string, shift_id: string, state: string, performance_id: string | null, production_title: string | null, title: string | null, duty_name: string, call_at: number, ends_at: number, window_closes_at: number, minutes_worked: number | null, shift_state: string }>(
    `SELECT a.id, a.shift_id, a.state, s.state AS shift_state, s.performance_id, p.title AS production_title, s.title, d.name AS duty_name, s.call_at, s.ends_at, s.window_closes_at, a.minutes_worked
       FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
       LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
      WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state NOT IN ('declined', 'withdrawn')
      ORDER BY s.call_at DESC LIMIT ?2`,
    accountId, LIMIT)
  // A shift the theatre cancelled reads as cancelled, not as given up by the person.
  const map = (r: typeof rows[number]): MyShift => ({ assignmentId: r.id, shiftId: r.shift_id, state: r.shift_state === 'cancelled' && r.state === 'released' ? 'cancelled' : r.state, performanceId: r.performance_id, productionTitle: r.production_title, title: r.title, dutyName: r.duty_name, callAt: r.call_at, endsAt: r.ends_at, minutesWorked: r.minutes_worked })
  const yearOf = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: await theatreTimeZone() })
  const year = yearOf.format(at)
  const inYear = (t: number) => yearOf.format(t) === year
  const RESOLVED = ['worked', 'no_show']
  return {
    coming: rows.filter(r => r.window_closes_at >= at && (LIVE_STATES as readonly string[]).includes(r.state)).map(map).reverse(),
    // Places given up or taken away on shifts still to come are not "past": they are not on the person's rota.
    // A night already resolved (worked or did not come) is past, even before its window closes.
    givenUp: rows.filter(r => r.window_closes_at >= at && !(LIVE_STATES as readonly string[]).includes(r.state) && !RESOLVED.includes(r.state)).map(map).reverse(),
    past: rows.filter(r => r.window_closes_at < at || RESOLVED.includes(r.state)).map(map),
    minutesThisYear: rows.filter(r => r.state === 'worked' && inYear(r.call_at)).reduce((sum, r) => sum + (r.minutes_worked ?? 0), 0),
  }
}

export interface ShiftView extends Shift {
  dutyDescription: string | null
  productionTitle: string | null
  venueName: string | null
  /** How long before the call a place can be given up without asking for cover, in seconds. */
  releaseNotice: number
  /** The performance's start, when the shift is for one. */
  curtainAt: number | null
  people: { name: string, state: string }[]
  /** `calendar` is the link that downloads the place as a calendar file. `freeRelease`: it may be given up at any time. */
  mine: { assignmentId: string, state: string, calendar: string, freeRelease: boolean } | null
  /** A shift of the person's own that overlaps this one, when they have none here. */
  clash: Clash | null
  /** Someone else's place that needs cover, which the person could take. */
  coverFor: string | null
}

/** One shift for a member: what it is, who else is on it (names only) and the person's own place. */
export async function shiftView(id: string, accountId: string): Promise<ShiftView | null> {
  const shift = await getShift(id)
  if (!shift || shift.state === 'draft') return null
  const people = await all<{ id: string, account_id: string, state: string, mine: number, moved_at: number | null }>(
    `SELECT a.id, a.account_id, a.state, a.moved_at, a.account_id IN (${accountScopeSql('?1')}) AS mine
       FROM front_of_house_assignments a WHERE a.shift_id = ?2 AND a.state IN (${live}) ORDER BY a.created_at`,
    accountId, id)
  const about = await first<{ description: string | null, production_title: string | null, venue_name: string | null, curtain_at: number | null }>(
    `SELECT d.description, p.title AS production_title, v.name AS venue_name, f.starts_at AS curtain_at FROM front_of_house_duties d
       LEFT JOIN core_performances f ON f.id = ?2 LEFT JOIN core_productions p ON p.id = f.production_id
       LEFT JOIN core_venues v ON v.id = coalesce(?3, f.venue_id) WHERE d.id = ?1 -- not-policy: numbered parameters
      `, shift.dutyId, shift.performanceId, shift.venueId)
  const mine = people.find(p => p.mine)
  return {
    ...shift,
    dutyDescription: about?.description ?? null,
    productionTitle: about?.production_title ?? null,
    venueName: about?.venue_name ?? null,
    curtainAt: about?.curtain_at ?? null,
    releaseNotice: await useSetting('front-of-house.shifts.release-notice') as number,
    people: await Promise.all(people.filter(p => p.state !== 'requested' && !p.mine).map(async p => ({ name: await accountLabel(p.account_id), state: p.state }))),
    mine: mine ? { assignmentId: mine.id, state: mine.state, calendar: `/api/front-of-house/assignments/${encodeURIComponent(mine.id)}/calendar.ics?k=${encodeURIComponent(await calendarKey(mine.id))}`, freeRelease: mine.moved_at !== null } : null,
    clash: mine ? null : clashing(await liveClashes(accountId), shift),
    coverFor: people.find(p => p.state === 'release_requested' && !p.mine)?.id ?? null,
  }
}
