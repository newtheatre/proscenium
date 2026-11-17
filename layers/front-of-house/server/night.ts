// On the night (part 3, "The Tonight board"; FH-19 to FH-23): check-in, timings, extending tonight,
// and the one read the front of house section of Tonight is drawn from. Being on shift never needs
// check-in: it is a record of attendance, not a key.
import { all, can, first, newId, nowMs, refuse, usePoint, useSetting, type Actor, type UnitView } from '#kit'
import { sql } from 'drizzle-orm'
import { accountLabel, getPerformance } from '#modules/core'
import { AUTHORITY_STATES, type TIMING_KINDS } from './db/schema'
import { shiftsOf } from './shifts'
import { runsFor } from './checklists'
import type { TonightFigure } from './points/tonight-figure'

export type TimingKind = typeof TIMING_KINDS[number]

const SECOND = 1000 // not-policy: settings are whole seconds
// "Extend tonight" moves the window in half-hour steps to at most six hours past the shift's end.
const EXTEND_STEP = 30 * 60 * SECOND // not-policy: fixed by the specification, part 3 rule 2
const EXTEND_CAP = 6 * 60 * 60 * SECOND // not-policy: fixed by the specification, part 3 rule 2
// A timing may be put an hour either side of now.
const TIMING_SLACK = 60 * 60 * SECOND // not-policy: fixed by the specification, part 3
// A figure that has not answered by then is shown as unavailable; it never holds the board up.
const FIGURE_BUDGET = 1500 // not-policy: the live-data budget for one figure, in milliseconds

// ---------------------------------------------------------------------------------------------
// Check-in (FH-21)

/**
 * Records that the person on an assignment has arrived. Only inside the window. A repeat, such as
 * two leads marking the same person, keeps the first time and changes nothing else.
 */
export async function checkIn(unit: UnitView, assignmentId: string): Promise<void> {
  const row = await first<{ state: string, window_opens_at: number, window_closes_at: number }>(
    'SELECT a.state, s.window_opens_at, s.window_closes_at FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id WHERE a.id = ?', assignmentId)
  if (!row) refuse('core.not-found', 'There is no such place on a shift.', { status: 404 })
  const at = nowMs()
  const refusal = at < row.window_opens_at
    ? { code: 'front-of-house.outside-window', reason: 'It is too early to check in for this shift.', remedy: 'Check in when you arrive for your call.' }
    : at > row.window_closes_at
      ? { code: 'front-of-house.shift-ended', reason: 'This shift has ended.' }
      : { code: 'front-of-house.assignment-ended', reason: 'This person is no longer on the shift.' }
  unit.add(sql`UPDATE front_of_house_assignments SET state = 'checked_in', checked_in_at = coalesce(checked_in_at, ${at}), updated_at = ${at}
    WHERE id = ${assignmentId} AND state IN ('confirmed', 'release_requested', 'checked_in')
      AND EXISTS (SELECT 1 FROM front_of_house_shifts s WHERE s.id = shift_id AND s.state = 'published' AND ${at} BETWEEN s.window_opens_at AND s.window_closes_at)`)
    .expect(1, refusal)
  if (row.state !== 'checked_in') unit.audit({ action: 'state', record: ['front-of-house.assignment', assignmentId], detail: { from: row.state, to: 'checked_in' } })
}

// ---------------------------------------------------------------------------------------------
// Timings (FH-22)

/**
 * Records a moment of the night, once per kind; recording it again replaces it and is audited.
 * With checklists.block-house-open on, house open is refused while a pre-show run is still open.
 */
export async function recordTiming(unit: UnitView, input: { performanceId: string, kind: TimingKind, at?: number, by: string }): Promise<void> {
  const now = nowMs()
  const at = input.at ?? now
  if (Math.abs(at - now) > TIMING_SLACK) refuse('front-of-house.timing-too-far', 'A time can be put at most an hour either side of now.', { status: 422, fields: { at: 'Within an hour of now.' } })
  const block = input.kind === 'house_open' && await useSetting('front-of-house.checklists.block-house-open') === true
  const blocked = block
    ? sql`EXISTS (SELECT 1 FROM front_of_house_checklist_runs r JOIN front_of_house_checklists c ON c.id = r.checklist_id WHERE r.performance_id = ${input.performanceId} AND r.state = 'open' AND c.moment = 'pre-show')`
    : sql`0`
  const id = newId('tmg')
  unit.add(sql`INSERT INTO front_of_house_timings (id, performance_id, kind, at, recorded_by, created_at, updated_at)
    SELECT ${id}, ${input.performanceId}, ${input.kind}, ${at}, ${input.by}, ${now}, ${now} WHERE NOT ${blocked}
    ON CONFLICT (performance_id, kind) DO UPDATE SET at = excluded.at, recorded_by = excluded.recorded_by, updated_at = excluded.updated_at`)
    .expect(1, { code: 'front-of-house.checklists-open', reason: 'A checklist for before the show is not finished yet.', remedy: 'Finish the checklist, or note what could not be done, then open the house.' })
  unit.audit({ action: 'update', record: ['core.performance', input.performanceId], detail: { timing: input.kind, at } })
}

// ---------------------------------------------------------------------------------------------
// Extend tonight (FH-23)

/** Moves every published shift's window half an hour later, to at most six hours past its end. Never earlier. */
export async function extendTonight(unit: UnitView, performanceId: string): Promise<{ closesAt: number | null }> {
  const now = nowMs()
  const before = await first<{ closes: number | null }>('SELECT max(window_closes_at) AS closes FROM front_of_house_shifts WHERE performance_id = ? AND state = \'published\'', performanceId)
  if (!before?.closes) refuse('front-of-house.no-shifts', 'This performance has no published shifts to extend.')
  unit.add(sql`UPDATE front_of_house_shifts SET window_closes_at = max(window_closes_at, min(window_closes_at + ${EXTEND_STEP}, ends_at + ${EXTEND_CAP})), updated_at = ${now}
    WHERE performance_id = ${performanceId} AND state = 'published'`)
  unit.audit({ action: 'update', record: ['core.performance', performanceId], detail: { extended: true } })
  const closes = await first<{ closes: number }>('SELECT max(max(window_closes_at, min(window_closes_at + ?, ends_at + ?))) AS closes FROM front_of_house_shifts WHERE performance_id = ? AND state = \'published\'', EXTEND_STEP, EXTEND_CAP, performanceId)
  return { closesAt: closes?.closes ?? null }
}

// ---------------------------------------------------------------------------------------------
// The board (FH-19, FH-20)

export interface FigureAnswer { value: string | number | null, state: 'ok' | 'attention' | 'unavailable', to?: string }

export async function readFigure(figure: TonightFigure, performanceId: string): Promise<FigureAnswer> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const late = new Promise<FigureAnswer>((resolve) => {
      timer = setTimeout(() => resolve({ value: null, state: 'unavailable' }), FIGURE_BUDGET)
    })
    return await Promise.race([Promise.resolve(figure.read(performanceId)), late])
  }
  catch {
    return { value: null, state: 'unavailable' }
  }
  finally {
    clearTimeout(timer)
  }
}

export interface Board {
  performance: { id: string, title: string, startsAt: number, endsAt: number, venueId: string, venueName: string, spaceName: string }
  windowClosesAt: number | null
  shifts: { id: string, dutyName: string, isLead: boolean, callAt: number, places: number, people: { assignmentId: string, name: string, state: string, checkedInAt: number | null, notArrived: boolean }[] }[]
  timings: { kind: string, at: number }[]
  checklists: Awaited<ReturnType<typeof runsFor>>
  figures: ({ id: string, label: string, order: number } & FigureAnswer)[]
}

/** One read of a performance for the front of house section of Tonight. Figures the viewer may not see are left out. */
export async function board(performanceId: string, actor: Actor): Promise<Board> {
  const performance = await getPerformance(performanceId)
  const now = nowMs()
  const late = await useSetting('front-of-house.shifts.late-after') as number
  const shifts = (await shiftsOf(performanceId)).filter(s => s.state === 'published' || s.state === 'completed')
  const people = await all<{ id: string, shift_id: string, account_id: string, state: string, checked_in_at: number | null }>(
    `SELECT a.id, a.shift_id, a.account_id, a.state, a.checked_in_at FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE s.performance_id = ? AND a.state IN (${[...AUTHORITY_STATES, 'worked', 'no_show'].map(s => `'${s}'`).join(', ')}) ORDER BY a.created_at`, performanceId)
  const named = await Promise.all(people.map(async p => ({ ...p, name: await accountLabel(p.account_id) })))
  const timings = await all<{ kind: string, at: number }>('SELECT kind, at FROM front_of_house_timings WHERE performance_id = ? ORDER BY at', performanceId)
  const figures: Board['figures'] = []
  for (const contribution of await usePoint<TonightFigure>('front-of-house.tonight-figure')) {
    const figure = contribution.value
    if (!(await can(actor, figure.ability as never, ['core.performance', performanceId])).allowed) continue
    figures.push({ id: contribution.id, label: figure.label, order: figure.order ?? 0, ...await readFigure(figure, performanceId) })
  }
  figures.sort((a, b) => a.order - b.order)
  return {
    performance: { id: performance.id, title: performance.productionTitle, startsAt: performance.startsAt, endsAt: performance.endsAt, venueId: performance.venueId, venueName: performance.venueName, spaceName: performance.spaceName },
    windowClosesAt: shifts.reduce<number | null>((m, s) => (m === null || s.windowClosesAt > m ? s.windowClosesAt : m), null),
    shifts: shifts.map(s => ({
      id: s.id, dutyName: s.dutyName, isLead: s.isLead, callAt: s.callAt, places: s.places,
      people: named.filter(p => p.shift_id === s.id).map(p => ({
        assignmentId: p.id, name: p.name, state: p.state, checkedInAt: p.checked_in_at,
        // A prompt to the lead, not a state.
        notArrived: p.state !== 'checked_in' && (AUTHORITY_STATES as readonly string[]).includes(p.state) && now > s.callAt + late * SECOND,
      })),
    })),
    timings,
    checklists: await runsFor(performanceId, performance.venueId),
    figures,
  }
}
