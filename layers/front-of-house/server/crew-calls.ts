// Crew calls (FH-49; festival-ready changes, part 3, "Crew calls, sign-up questions and handouts"):
// an invitation to crew a period, holding the sign-up questions and the perks rules. The questions
// are the form attached in forms' slot `front-of-house.crew-call`; forms holds which form and the
// answers, and this module asks only whether a person has sent theirs (CC1, CC2).
import { all, first, newId, nowMs, refuse, today, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { slotAsks, slotRespondents } from '#modules/forms'
import type { CREW_CALL_STATES } from './db/schema'
import { LIVE_STATES } from './db/schema'

export const CREW_SLOT = 'front-of-house.crew-call'
export type CrewCallState = typeof CREW_CALL_STATES[number]

/** Which question of the sign-up form is which, by key. Keys only: never an answer. */
export interface QuestionRoles { tshirtSize?: string, mealDays?: string, dietaryNeed?: string }

export interface CrewCall {
  id: string
  name: string
  seasonId: string | null
  startsOn: string
  endsOn: string
  questionRoles: QuestionRoles
  tshirtMinShifts: number | null
  mealMinMinutes: number | null
  mealsOnRequest: boolean
  state: CrewCallState
  createdAt: number
}

interface CrewCallRow { id: string, name: string, season_id: string | null, starts_on: string, ends_on: string, question_roles: string, tshirt_min_shifts: number | null, meal_min_minutes: number | null, meals_on_request: number, state: CrewCallState, created_at: number }

const toCrewCall = (r: CrewCallRow): CrewCall => ({
  id: r.id, name: r.name, seasonId: r.season_id, startsOn: r.starts_on, endsOn: r.ends_on, questionRoles: JSON.parse(r.question_roles) as QuestionRoles,
  tshirtMinShifts: r.tshirt_min_shifts, mealMinMinutes: r.meal_min_minutes, mealsOnRequest: !!r.meals_on_request, state: r.state, createdAt: r.created_at,
})

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')
const NAME_TAKEN = { code: 'front-of-house.crew-call.name-taken', reason: 'There is already a crew call with that name.', remedy: 'Choose another name, or archive the old call first.' }

export async function getCrewCall(id: string): Promise<CrewCall | null> {
  const row = await first<CrewCallRow>('SELECT * FROM front_of_house_crew_calls WHERE id = ?', id)
  return row ? toCrewCall(row) : null
}

export async function requireCrewCall(id: string | undefined): Promise<CrewCall> {
  const call = id ? await getCrewCall(id) : null
  return call ?? refuse('core.not-found', 'There is no such crew call.', { status: 404 }) // not-policy: HTTP status
}

export interface CrewCallSummary extends CrewCall { seasonName: string | null, shifts: number, crew: number, questions: boolean }

/** Every crew call, newest first, with its shifts and crew counted. Archived ones only when asked. */
export async function listCrewCalls(options: { includeArchived?: boolean, id?: string } = {}): Promise<CrewCallSummary[]> {
  const where = options.id ? 'WHERE c.id = ?' : options.includeArchived ? '' : 'WHERE c.state <> \'archived\''
  const rows = await all<CrewCallRow & { season_name: string | null, shifts: number, crew: number }>(
    `SELECT c.*, se.name AS season_name,
        (SELECT count(*) FROM front_of_house_shifts s WHERE s.crew_call_id = c.id AND s.state <> 'cancelled') AS shifts,
        (SELECT count(DISTINCT a.account_id) FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
          WHERE s.crew_call_id = c.id AND a.state IN (${live}, 'worked')) AS crew
       FROM front_of_house_crew_calls c LEFT JOIN core_seasons se ON se.id = c.season_id
      ${where} ORDER BY c.starts_on DESC, c.name`, ...(options.id ? [options.id] : []))
  return Promise.all(rows.map(async r => ({ ...toCrewCall(r), seasonName: r.season_name, shifts: Number(r.shifts), crew: Number(r.crew), questions: await slotAsks(CREW_SLOT, r.id) })))
}

export interface CrewCallInput {
  name: string
  seasonId?: string | null
  startsOn: string
  endsOn: string
  questionRoles?: QuestionRoles
  tshirtMinShifts?: number | null
  mealMinMinutes?: number | null
  mealsOnRequest?: boolean
}

function checkDates(input: { startsOn: string, endsOn: string }): void {
  if (input.endsOn < input.startsOn) refuse('front-of-house.crew-call.dates', 'A crew call must end on or after the day it starts.', { status: 422, fields: { endsOn: 'Must be on or after the start.' } }) // not-policy: HTTP status
}

/** A new crew call, as a draft. Shifts already made for its season's performances join it (FH-49). */
export function createCrewCall(unit: UnitView, input: CrewCallInput, by: string): string {
  checkDates(input)
  const id = newId('crc')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO front_of_house_crew_calls (id, name, season_id, starts_on, ends_on, question_roles, tshirt_min_shifts, meal_min_minutes, meals_on_request, state, created_by, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM front_of_house_crew_calls WHERE name = ? AND state <> 'archived')`,
    params: [id, input.name, input.seasonId ?? null, input.startsOn, input.endsOn, JSON.stringify(input.questionRoles ?? {}), input.tshirtMinShifts ?? null, input.mealMinMinutes ?? null, input.mealsOnRequest === false ? 0 : 1, by, at, at, input.name],
  }).expect(1, NAME_TAKEN)
  if (input.seasonId) joinSeason(unit, id, input.seasonId)
  unit.audit({ action: 'create', record: ['front-of-house.crew-call', id] })
  return id
}

/** Changes a crew call that is not archived. A new season brings that season's unclaimed shifts with it. */
export async function updateCrewCall(unit: UnitView, id: string, patch: Partial<CrewCallInput>): Promise<void> {
  const call = await requireCrewCall(id)
  if (call.state === 'archived') refuse('front-of-house.crew-call.archived', 'This crew call is archived.', { remedy: 'Make a new crew call instead.' })
  const next = { ...call, ...patch }
  checkDates(next)
  unit.add({
    sql: `UPDATE front_of_house_crew_calls SET name = ?, season_id = ?, starts_on = ?, ends_on = ?, question_roles = ?, tshirt_min_shifts = ?, meal_min_minutes = ?, meals_on_request = ?, updated_at = ?
       WHERE id = ? AND state <> 'archived' AND NOT EXISTS (SELECT 1 FROM front_of_house_crew_calls o WHERE o.name = ? AND o.id <> ? AND o.state <> 'archived')`,
    params: [next.name, next.seasonId ?? null, next.startsOn, next.endsOn, JSON.stringify(next.questionRoles ?? {}), next.tshirtMinShifts ?? null, next.mealMinMinutes ?? null, next.mealsOnRequest === false ? 0 : 1, nowMs(), id, next.name, id],
  }).expect(1, NAME_TAKEN)
  if (next.seasonId && next.seasonId !== call.seasonId) joinSeason(unit, id, next.seasonId)
  unit.audit({ action: 'update', record: ['front-of-house.crew-call', id], detail: { fields: Object.keys(patch).sort() } })
}

/** The moves of a crew call (part 3's table): draft to open, open to closed, closed to archived after it ends. */
const MOVES: Record<CrewCallState, CrewCallState[]> = { draft: ['open'], open: ['closed'], closed: ['open', 'archived'], archived: [] }

export async function moveCrewCall(unit: UnitView, id: string, to: CrewCallState): Promise<void> {
  const call = await requireCrewCall(id)
  if (!MOVES[call.state].includes(to)) refuse('front-of-house.crew-call.cannot-move', `A crew call that is ${call.state} cannot be made ${to}.`)
  if (to === 'archived' && call.endsOn >= await today())
    refuse('front-of-house.crew-call.not-ended', 'A crew call can be archived only after it ends.', { remedy: 'Close it for now, and archive it once its last day has passed.' })
  unit.add({ sql: 'UPDATE front_of_house_crew_calls SET state = ?, updated_at = ? WHERE id = ? AND state = ?', params: [to, nowMs(), id, call.state] })
    .expect(1, { code: 'front-of-house.crew-call.moved-on', reason: 'Someone else has just changed this crew call.', remedy: 'Reload it and try again.' })
  unit.audit({ action: 'update', record: ['front-of-house.crew-call', id], detail: { from: call.state, to } })
}

/** Shifts of the season's performances that no call holds yet join this one. */
function joinSeason(unit: UnitView, callId: string, seasonId: string): void {
  unit.add({
    sql: `UPDATE front_of_house_shifts SET crew_call_id = ?, updated_at = ? WHERE crew_call_id IS NULL AND state <> 'cancelled'
      AND performance_id IN (SELECT f.id FROM core_performances f JOIN core_productions p ON p.id = f.production_id WHERE p.season_id = ?)`,
    params: [callId, nowMs(), seasonId],
  })
}

/**
 * New shifts of a performance join the newest draft or open crew call for the performance's
 * season, in the same unit as they are made (FH-49). One statement for any number of shifts.
 */
export function joinSeasonCall(unit: UnitView, shiftIds: string[]): void {
  if (!shiftIds.length) return
  unit.add({
    sql: `UPDATE front_of_house_shifts SET crew_call_id = (SELECT c.id FROM front_of_house_crew_calls c
        JOIN core_productions p ON p.season_id = c.season_id JOIN core_performances f ON f.production_id = p.id
        WHERE f.id = front_of_house_shifts.performance_id AND c.state IN ('draft', 'open') ORDER BY c.created_at DESC LIMIT 1)
      WHERE id IN (SELECT value FROM json_each(?)) AND crew_call_id IS NULL AND performance_id IS NOT NULL`,
    params: [JSON.stringify(shiftIds)],
  })
}

/** A call's sign-up questions, while they are asked: the call is draft or open and has a published form. */
async function asking(callId: string | null): Promise<CrewCall | null> {
  if (!callId) return null
  const call = await getCrewCall(callId)
  if (!call || (call.state !== 'draft' && call.state !== 'open')) return null
  return await slotAsks(CREW_SLOT, call.id) ? call : null
}

/** Whether this person has sent their answers to the call's questions. */
export async function hasAnswered(callId: string, accountId: string): Promise<boolean> {
  return (await slotRespondents(CREW_SLOT, callId)).has(accountId)
}

/** The crew call whose questions this person must answer before taking the shift, or null (CC1). */
export async function questionsWaiting(shift: { crewCallId: string | null }, accountId: string): Promise<CrewCall | null> {
  const call = await asking(shift.crewCallId)
  return call && !await hasAnswered(call.id, accountId) ? call : null
}

/** CC1: a volunteer is refused, with the way to the questions. A manager's assignment only warns. */
export async function requireAnswered(shift: { crewCallId: string | null }, accountId: string): Promise<void> {
  const call = await questionsWaiting(shift, accountId)
  if (call) refuse('front-of-house.crew-call.questions-first', `${call.name} asks some questions before you sign up to its shifts.`, { remedy: 'Answer the crew questions first, then sign up.', detail: { crewCallId: call.id } })
}

export interface CrewMember { accountId: string, name: string, shifts: number, minutes: number, answered: boolean }
export interface CrewShift { id: string, title: string | null, productionTitle: string | null, dutyName: string, callAt: number, endsAt: number, places: number, placesTaken: number, state: string }

/** A crew call's page: the call, its shifts, and who signed up, with whether each has answered. */
export async function crewCallView(id: string, nameOf: (accountId: string) => Promise<string>): Promise<CrewCallSummary & { crewList: CrewMember[], shiftList: CrewShift[] }> {
  const call = await requireCrewCall(id)
  const [summary] = await listCrewCalls({ id: call.id })
  const shiftList = await all<{ id: string, title: string | null, production_title: string | null, duty_name: string, call_at: number, ends_at: number, places: number, places_taken: number, state: string }>(
    `SELECT s.id, s.title, p.title AS production_title, d.name AS duty_name, s.call_at, s.ends_at, s.places, s.places_taken, s.state
       FROM front_of_house_shifts s JOIN front_of_house_duties d ON d.id = s.duty_id
       LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
      WHERE s.crew_call_id = ? ORDER BY s.call_at, d.sort_order`, call.id)
  const crew = await all<{ account_id: string, shifts: number, minutes: number }>(
    `SELECT a.account_id, count(*) AS shifts, sum((s.ends_at - s.call_at) / 60000) AS minutes -- not-policy: milliseconds in a minute
       FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE s.crew_call_id = ? AND a.state IN (${live}, 'worked') GROUP BY a.account_id`, call.id)
  const answered = await slotRespondents(CREW_SLOT, call.id)
  const crewList = await Promise.all(crew.map(async c => ({ accountId: c.account_id, name: await nameOf(c.account_id), shifts: Number(c.shifts), minutes: Number(c.minutes), answered: answered.has(c.account_id) })))
  return {
    ...summary!,
    crewList: crewList.sort((a, b) => a.name.localeCompare(b.name)),
    shiftList: shiftList.map(s => ({ id: s.id, title: s.title, productionTitle: s.production_title, dutyName: s.duty_name, callAt: s.call_at, endsAt: s.ends_at, places: s.places, placesTaken: s.places_taken, state: s.state })),
  }
}

/** Crew calls this person signed up to without answering their questions, for My account's Upcoming. */
export async function unansweredCalls(accountId: string): Promise<{ id: string, name: string, startsOn: string }[]> {
  const calls = await all<{ id: string, name: string, starts_on: string }>(
    `SELECT DISTINCT c.id, c.name, c.starts_on FROM front_of_house_crew_calls c JOIN front_of_house_shifts s ON s.crew_call_id = c.id
       JOIN front_of_house_assignments a ON a.shift_id = s.id
      WHERE c.state IN ('draft', 'open') AND a.state IN (${live}) AND a.account_id IN (${accountScopeSql('?1')}) ORDER BY c.starts_on`, accountId)
  const out: { id: string, name: string, startsOn: string }[] = []
  for (const c of calls) {
    if (await slotAsks(CREW_SLOT, c.id) && !await hasAnswered(c.id, accountId)) out.push({ id: c.id, name: c.name, startsOn: c.starts_on })
  }
  return out
}
