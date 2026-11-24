// Sessions, places and attendance (second-round part 3, P1 to P11 and S6; TR-09 to TR-14). The
// last place is decided by the statement, never by a count read first (P2); freeing a place and
// promoting the first person waiting are one unit (P3); marking attended writes the session steps'
// sign-offs and may award a training record in the same unit (S6).
import { all, first, newId, nowMs, refuse, theatreTimeZone, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { canonicalAccount, findOrCreateAccount, isSpaceFree, notify } from '#modules/core'
import { courseOrRefuse, type Course } from './courses'
import { theatreDay } from './days'
import { addSignOff, evaluateAward, samePerson, type PendingSignOff } from './progress'
import type { PlaceState, SessionState } from '../shared/states'

const SECOND = 1000 // not-policy: settings are whole seconds

export interface Session {
  id: string
  courseId: string
  courseTitle: string
  versionId: string
  title: string | null
  startsAt: number
  endsAt: number
  spaceId: string | null
  spaceName: string | null
  placeNote: string | null
  capacity: number
  placesTaken: number
  signUp: 'open' | 'invited'
  status: SessionState
  cancelReason: string | null
  attendanceClosedAt: number | null
}

const SESSION = `SELECT s.id, s.course_id AS courseId, c.title AS courseTitle, s.version_id AS versionId, s.title, s.starts_at AS startsAt, s.ends_at AS endsAt,
    s.space_id AS spaceId, sp.name AS spaceName, s.place_note AS placeNote, s.capacity, s.places_taken AS placesTaken, s.sign_up AS signUp,
    s.status, s.cancel_reason AS cancelReason, s.attendance_closed_at AS attendanceClosedAt
  FROM training_sessions s JOIN training_courses c ON c.id = s.course_id LEFT JOIN core_spaces sp ON sp.id = s.space_id`

export async function getSession(id: string): Promise<Session | null> {
  return first<Session>(`${SESSION} WHERE s.id = ?`, id)
}

export async function sessionOrRefuse(id: string): Promise<Session> {
  return await getSession(id) ?? refuse('training.session.not-found', 'There is no such session.', { status: 404 })
}

/** Sessions from an instant on, published only unless the reader manages them, soonest first. */
export async function listSessions(options: { courseId?: string, from: number, unpublished: boolean }): Promise<Session[]> {
  return all<Session>(
    `${SESSION} WHERE s.ends_at > ?1 AND (?2 IS NULL OR s.course_id = ?2) AND (s.status = 'published' OR (?3 AND s.status = 'unpublished')) /* not-policy: bound parameters */
      ORDER BY s.starts_at, s.id`,
    options.from, options.courseId ?? null, options.unpublished ? 1 : 0,
  )
}

export interface Place { id: string, sessionId: string, accountId: string, name: string | null, state: PlaceState, waitingSince: number | null, markedAt: number | null, note: string | null }

const PLACE = `SELECT p.id, p.session_id AS sessionId, p.account_id AS accountId, a.name, p.state, p.waiting_since AS waitingSince, p.marked_at AS markedAt, p.note
  FROM training_session_places p LEFT JOIN core_accounts a ON a.id = p.account_id`

export async function placesOf(sessionId: string): Promise<Place[]> {
  return all<Place>(`${PLACE} WHERE p.session_id = ? AND p.state != 'cancelled' ORDER BY p.state = 'waiting', p.waiting_since, p.created_at, p.id`, sessionId)
}

async function placeOrRefuse(id: string): Promise<Place> {
  return await first<Place>(`${PLACE} WHERE p.id = ?`, id) ?? refuse('training.place.not-found', 'There is no such place.', { status: 404 })
}

/** The person's own place on a session, over their account scope, if they have one. */
export async function placeFor(sessionId: string, accountId: string): Promise<Place | null> {
  return first<Place>(`${PLACE} WHERE p.session_id = ?1 AND p.state != 'cancelled' AND p.account_id IN (${accountScopeSql('?2')})`, sessionId, accountId)
}

/** The person's places on sessions not yet over, soonest first. */
export async function placesOfPerson(accountId: string): Promise<(Place & { session: Session })[]> {
  const places = await all<Place>(`${PLACE} JOIN training_sessions s ON s.id = p.session_id
    WHERE p.account_id IN (${accountScopeSql('?1')}) AND p.state != 'cancelled' AND s.ends_at > ?2 ORDER BY s.starts_at`, accountId, nowMs())
  const out = []
  for (const place of places) out.push({ ...place, session: (await getSession(place.sessionId))! })
  return out
}

/** A session's trainers: those named on it, or else the course's. */
export async function sessionTrainers(session: Pick<Session, 'id' | 'courseId'>): Promise<{ accountId: string, name: string | null }[]> {
  const named = await all<{ accountId: string, name: string | null }>(
    'SELECT t.account_id AS accountId, a.name FROM training_session_trainers t LEFT JOIN core_accounts a ON a.id = t.account_id WHERE t.session_id = ? ORDER BY a.name',
    session.id,
  )
  if (named.length) return named
  return all<{ accountId: string, name: string | null }>(
    `SELECT DISTINCT coalesce(a.merged_into_id, t.account_id) AS accountId, coalesce(m.name, a.name) AS name FROM training_course_trainers t
      LEFT JOIN core_accounts a ON a.id = t.account_id LEFT JOIN core_accounts m ON m.id = a.merged_into_id WHERE t.course_id = ? ORDER BY 2`,
    session.courseId,
  )
}

const whenOf = async (session: Pick<Session, 'startsAt'>) => {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: await theatreTimeZone() }).format(session.startsAt)
}
const nameOf = (session: Pick<Session, 'title' | 'courseTitle'>) => session.title ?? session.courseTitle

/**
 * Refuses a period in a space that something else holds (P10): core's isSpaceFree for performances
 * and every other module, and Training's own published sessions except the one being moved.
 */
async function checkSpace(spaceId: string, from: number, to: number, exceptSession?: string): Promise<void> {
  const ours = await first<{ id: string }>(
    'SELECT id FROM training_sessions WHERE space_id = ?1 AND status = \'published\' AND starts_at < ?3 AND ends_at > ?2 AND id IS NOT ?4',
    spaceId, from, to, exceptSession ?? null,
  )
  if (ours || !(await isSpaceFree(spaceId, from, to, { except: 'training' })))
    refuse('training.session.space-taken', ours ? 'Another training session is in that space then.' : 'That space is taken then.', { status: 409, remedy: 'Choose another time or space; the room calendar shows what holds it.' })
}

export interface SessionInput {
  title?: string | null
  startsAt: number
  endsAt: number
  spaceId?: string | null
  placeNote?: string | null
  capacity?: number
  signUp?: 'open' | 'invited'
  trainerIds?: string[]
}

function checkTimes(startsAt: number, endsAt: number): void {
  if (endsAt <= startsAt) refuse('training.session.times', 'A session ends after it starts.', { status: 422, fields: { endsAt: 'Choose a time after the start.' } })
  if (startsAt <= nowMs()) refuse('training.session.past', 'A session is scheduled for the future.', { status: 422, fields: { startsAt: 'Choose a time in the future.' } })
}

/** Schedules a session of a live course on its live version, unpublished until published (TR-09). */
export async function createSession(unit: UnitView, actor: Actor, courseId: string, input: SessionInput): Promise<string> {
  const course = await courseOrRefuse(courseId)
  if (course.status !== 'live' || !course.liveVersionId) refuse('training.course.not-live', 'Only a live course takes new sessions.', { status: 409 })
  checkTimes(input.startsAt, input.endsAt)
  const id = newId('tses')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO training_sessions (id, course_id, version_id, title, starts_at, ends_at, space_id, place_note, capacity, sign_up, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpublished', ?, ?, ?)`,
    params: [id, courseId, course.liveVersionId, input.title ?? null, input.startsAt, input.endsAt, input.spaceId ?? null, input.placeNote ?? null,
      input.capacity ?? (await useSetting('training.sessions.default-capacity') as number), input.signUp ?? 'open', actor.accountId ?? null, at, at],
  })
  if (input.trainerIds?.length) await setTrainers(unit, id, input.trainerIds)
  unit.audit({ action: 'create', record: ['training.session', id] })
  return id
}

async function setTrainers(unit: UnitView, sessionId: string, accountIds: string[]): Promise<void> {
  const canonical = [...new Set(await Promise.all(accountIds.map(canonicalAccount)))]
  unit.add({ sql: 'DELETE FROM training_session_trainers WHERE session_id = ?', params: [sessionId] })
  if (!canonical.length) return
  unit.add({
    sql: 'INSERT INTO training_session_trainers (session_id, account_id, created_at) SELECT ?, value, ? FROM json_each(?)',
    params: [sessionId, nowMs(), JSON.stringify(canonical)],
  }).expect(canonical.length)
}

/** People with a place who are booked or waiting, for telling them of a change. */
async function holdersOfPlaces(sessionId: string): Promise<string[]> {
  return (await all<{ accountId: string }>('SELECT account_id AS accountId FROM training_session_places WHERE session_id = ? AND state IN (\'booked\', \'waiting\')', sessionId)).map(r => r.accountId)
}

/**
 * Changes a session. A published one moved in time or space is checked against the room (P10) and
 * everyone with a place and its trainers are told (P5); capacity never drops below the places taken,
 * and raising it promotes from the waiting list in the same unit (P4).
 */
export async function updateSession(unit: UnitView, id: string, change: Partial<SessionInput>): Promise<void> {
  const before = await sessionOrRefuse(id)
  const next = await plannedChange(before, change)
  unit.add({
    sql: `UPDATE training_sessions SET title = ?, starts_at = ?, ends_at = ?, space_id = ?, place_note = ?, capacity = ?, sign_up = ?, updated_at = ?
      WHERE id = ? AND status IN ('unpublished', 'published') AND places_taken <= ?`,
    params: [next.title, next.startsAt, next.endsAt, next.spaceId, next.placeNote, next.capacity, next.signUp, nowMs(), id, next.capacity],
  }).expect(1, { code: 'training.session.capacity-below-taken', reason: 'More places were taken meanwhile; capacity cannot go below them.' })
  if (change.trainerIds) await setTrainers(unit, id, change.trainerIds)
  if (next.capacity > before.capacity) await promote(unit, before, next.capacity - before.placesTaken)
  if (next.moved && before.status === 'published') await tellMoved(unit, before, next)
  unit.audit({ action: 'update', record: ['training.session', id], detail: { fields: Object.keys(change) } })
}

/** Each field as changed, or as it was where the change leaves it out; null clears a nullable one. */
function merged(before: Session, change: Partial<SessionInput>) {
  const pick = <K extends 'title' | 'spaceId' | 'placeNote'>(key: K) => change[key] === undefined ? before[key] : change[key] ?? null
  return {
    title: pick('title'),
    startsAt: change.startsAt ?? before.startsAt,
    endsAt: change.endsAt ?? before.endsAt,
    spaceId: pick('spaceId'),
    placeNote: pick('placeNote'),
    capacity: change.capacity ?? before.capacity,
    signUp: change.signUp ?? before.signUp,
  }
}

/** The session as the change leaves it, refused where it may not change so (P4, P10). */
async function plannedChange(before: Session, change: Partial<SessionInput>) {
  if (before.status !== 'unpublished' && before.status !== 'published') refuse('training.session.closed', 'A cancelled or completed session cannot be changed.', { status: 409 })
  const next = merged(before, change)
  const moved = next.startsAt !== before.startsAt || next.endsAt !== before.endsAt || next.spaceId !== before.spaceId
  if (moved) checkTimes(next.startsAt, next.endsAt)
  if (moved && before.status === 'published' && next.spaceId) await checkSpace(next.spaceId, next.startsAt, next.endsAt, before.id)
  if (next.capacity < before.placesTaken)
    refuse('training.session.capacity-below-taken', `${before.placesTaken} places are taken, so capacity cannot go below that.`, { status: 409, fields: { capacity: `At least ${before.placesTaken}.` } })
  return { ...next, moved }
}

/** Tells everyone with a place and the trainers that a published session moved (P5). */
async function tellMoved(unit: UnitView, before: Session, next: { startsAt: number, endsAt: number, spaceId: string | null }): Promise<void> {
  const to = [...await holdersOfPlaces(before.id), ...(await sessionTrainers(before)).map(t => t.accountId)]
  // Keyed by the new time and space, so moving back tells people again (P5).
  if (to.length) await notify(unit, 'training.session-changed', { to: [...new Set(to)], variables: { session: nameOf(before), when: await whenOf({ ...before, startsAt: next.startsAt }) }, dedupeKey: `${before.id}:${next.startsAt}:${next.endsAt}:${next.spaceId}`, subject: ['training.session', before.id] })
  unit.announce('training.session.changed', { sessionId: before.id, courseId: before.courseId }, { record: ['training.session', before.id] })
}

/** Publishes a session: its course live, its start in the future and its space free (P10, TR-09). */
export async function publishSession(unit: UnitView, id: string): Promise<void> {
  const session = await sessionOrRefuse(id)
  const course = await courseOrRefuse(session.courseId)
  if (course.status !== 'live') refuse('training.course.not-live', 'Only a session of a live course can be published.', { status: 409 })
  if (session.startsAt <= nowMs()) refuse('training.session.past', 'This session has already started.', { status: 409 })
  if (session.spaceId) await checkSpace(session.spaceId, session.startsAt, session.endsAt, id)
  unit.add({ sql: 'UPDATE training_sessions SET status = \'published\', updated_at = ? WHERE id = ? AND status = \'unpublished\'', params: [nowMs(), id] })
    .expect(1, { code: 'training.session.not-unpublished', reason: 'This session is already published, cancelled or completed.' })
  unit.announce('training.session.published', { sessionId: id, courseId: session.courseId }, { record: ['training.session', id] })
  unit.audit({ action: 'state', record: ['training.session', id], detail: { status: 'published' } })
}

/** Cancels a session with a reason; every place is cancelled and told in the same unit. */
export async function cancelSession(unit: UnitView, id: string, reason: string): Promise<void> {
  const session = await sessionOrRefuse(id)
  const told = session.status === 'published' ? [...await holdersOfPlaces(id), ...(await sessionTrainers(session)).map(t => t.accountId)] : []
  const at = nowMs()
  unit.add({ sql: 'UPDATE training_sessions SET status = \'cancelled\', cancel_reason = ?, updated_at = ? WHERE id = ? AND status IN (\'unpublished\', \'published\')', params: [reason, at, id] })
    .expect(1, { code: 'training.session.closed', reason: 'This session is already cancelled or completed.' })
  unit.add({
    sql: 'UPDATE training_session_places SET state = \'cancelled\', counted = 0, cancelled_at = ?, cancel_kind = \'session-cancelled\', updated_at = ? WHERE session_id = ? AND state IN (\'booked\', \'waiting\')',
    params: [at, at, id],
  })
  if (told.length) await notify(unit, 'training.session-cancelled', { to: [...new Set(told)], variables: { session: nameOf(session), when: await whenOf(session), reason }, dedupeKey: id, subject: ['training.session', id] })
  unit.announce('training.session.cancelled', { sessionId: id, courseId: session.courseId }, { record: ['training.session', id] })
  unit.audit({ action: 'state', record: ['training.session', id], detail: { status: 'cancelled' } })
}

/**
 * Promotes up to `room` people waiting, first come first served, in the caller's unit (P3, P4).
 * Each is promoted only if still waiting when the statement runs.
 */
async function promote(unit: UnitView, session: Session, room: number): Promise<void> {
  if (room <= 0 || session.startsAt <= nowMs()) return
  const waiting = await all<{ id: string, accountId: string }>(
    'SELECT id, account_id AS accountId FROM training_session_places WHERE session_id = ? AND state = \'waiting\' ORDER BY waiting_since, id LIMIT ?',
    session.id, room,
  )
  if (!waiting.length) return
  const at = nowMs()
  unit.add({
    sql: 'UPDATE training_session_places SET state = \'booked\', counted = 1, updated_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND state = \'waiting\'',
    params: [at, JSON.stringify(waiting.map(w => w.id))],
  })
  await notify(unit, 'training.place-promoted', { to: waiting.map(w => ({ accountId: w.accountId, dedupeKey: w.id })), variables: { session: nameOf(session), when: await whenOf(session) }, subject: ['training.session', session.id] })
  for (const w of waiting) unit.announce('training.place.promoted', { placeId: w.id, sessionId: session.id, accountId: w.accountId }, { record: ['training.session', session.id] })
}

/** Whether the session takes a place from this booker now (P1): open sign-up before it closes, or staff before the start. */
async function checkBookable(session: Session, by: 'self' | 'staff'): Promise<void> {
  if (session.status !== 'published') refuse('training.session.not-open', 'This session is not taking places.', { status: 409 })
  if (by === 'staff') {
    if (session.startsAt <= nowMs()) refuse('training.session.started', 'This session has started; add a walk-in instead.', { status: 409 })
    return
  }
  if (session.signUp !== 'open') refuse('training.session.invited-only', 'Places on this session are given by whoever runs it.', { status: 403, remedy: 'Ask a trainer of the course for a place.' })
  const closes = session.startsAt - (await useSetting('training.sessions.sign-up-closes-before') as number) * SECOND
  if (nowMs() >= closes) refuse('training.session.sign-up-closed', 'Sign-up for this session has closed.', { status: 409, remedy: 'Ask a trainer of the course whether there is still room.' })
}

export interface Booking { sessionId: string, accountId: string, by: 'self' | 'staff' }

/**
 * Gives a person a place (P1, P2): booked while a place is free, decided by the statement, or on the
 * waiting list when full and the list is on. `by` is 'self' for the person, 'staff' for anyone else.
 */
export async function bookPlace(unit: UnitView, actor: Actor, { sessionId, accountId, by }: Booking): Promise<{ placeId: string, state: 'booked' | 'waiting' }> {
  const session = await sessionOrRefuse(sessionId)
  await checkBookable(session, by)
  const person = await canonicalAccount(accountId)
  if (await placeFor(sessionId, person)) refuse('training.place.already', by === 'self' ? 'You already have a place on this session.' : 'They already have a place on this session.', { status: 409 })
  const id = newId('tplc')
  const at = nowMs()
  const state = session.placesTaken >= session.capacity ? 'waiting' : 'booked'
  if (state === 'waiting' && !(await useSetting('training.sessions.waiting-list') as boolean)) refuse('training.session.full', 'This session is full.', { status: 409 })
  const notYet = `NOT EXISTS (SELECT 1 FROM training_session_places WHERE session_id = ?2 AND state != 'cancelled' AND account_id IN (${accountScopeSql('?3')}))`
  if (state === 'waiting') {
    unit.add({
      sql: `INSERT INTO training_session_places (id, session_id, account_id, state, counted, waiting_since, added_by, created_at, updated_at)
        SELECT ?1, ?2, ?3, 'waiting', 0, ?4, ?5, ?4, ?4 WHERE ${notYet} /* not-policy: bound parameters */`,
      params: [id, sessionId, person, at, actor.accountId ?? null],
    }).expect(1, { code: 'training.place.already', reason: 'There is already a place for this person on this session.' })
  }
  else {
    // The predicate on the statement takes the last place once; the loser is offered the waiting list (P2).
    unit.add({
      sql: `INSERT INTO training_session_places (id, session_id, account_id, state, counted, added_by, created_at, updated_at)
        SELECT ?1, ?2, ?3, 'booked', 1, ?5, ?4, ?4 WHERE (SELECT places_taken < capacity FROM training_sessions WHERE id = ?2) AND ${notYet} /* not-policy: bound parameters */`,
      params: [id, sessionId, person, at, actor.accountId ?? null],
    }).expect(1, { code: 'training.session.full', reason: 'The last place has just been taken.', remedy: 'Join the waiting list instead.' })
    await notify(unit, 'training.place-booked', { to: person, variables: { session: nameOf(session), when: await whenOf(session) }, dedupeKey: id, subject: ['training.session', sessionId] })
  }
  unit.announce('training.place.booked', { placeId: id, sessionId, accountId: person, state }, { record: ['training.session', sessionId] })
  unit.audit({ action: 'create', record: ['training.session', sessionId], detail: { place: id, account: person, state, by } })
  return { placeId: id, state }
}

/** The person cancels their own place only until the deadline, or up to the start once promoted (P3). */
async function checkOwnCancel(actor: Actor, place: Place, session: Session): Promise<void> {
  if (!await samePerson(actor.accountId, place.accountId)) refuse('training.place.not-found', 'There is no such place.', { status: 404 })
  if (place.state !== 'booked') return
  const promoted = place.waitingSince !== null
  const until = session.startsAt - (promoted ? 0 : (await useSetting('training.sessions.cancel-until') as number) * SECOND)
  if (nowMs() < until) return
  const trainer = (await sessionTrainers(session))[0]?.name
  refuse('training.place.too-late', 'It is too late to cancel this place here.', { status: 409, remedy: trainer ? `Tell ${trainer}, who is running it.` : 'Tell whoever is running it.' })
}

/**
 * Cancels a place (P3, TR-11). The person may until `training.sessions.cancel-until` before the
 * start, or up to the start when they were promoted from the waiting list; staff may any time
 * before it. A booked place freed promotes the first person waiting in the same unit.
 */
export async function cancelPlace(unit: UnitView, actor: Actor, placeId: string, by: 'self' | 'staff'): Promise<void> {
  const place = await placeOrRefuse(placeId)
  const session = await sessionOrRefuse(place.sessionId)
  if (place.state !== 'booked' && place.state !== 'waiting') refuse('training.place.not-open', 'This place is already cancelled or marked.', { status: 409 })
  if (session.status !== 'published' || session.startsAt <= nowMs()) refuse('training.session.started', 'This session has started or closed, so its places are marked, not cancelled.', { status: 409 })
  if (by === 'self') await checkOwnCancel(actor, place, session)
  const at = nowMs()
  unit.add({
    sql: 'UPDATE training_session_places SET state = \'cancelled\', counted = 0, cancelled_at = ?, cancel_kind = ?, updated_at = ? WHERE id = ? AND state IN (\'booked\', \'waiting\')',
    params: [at, by, at, placeId],
  }).expect(1, { code: 'training.place.not-open', reason: 'This place is already cancelled or marked.' })
  if (by === 'staff') await notify(unit, 'training.place-cancelled-by-staff', { to: place.accountId, variables: { session: nameOf(session), when: await whenOf(session) }, dedupeKey: placeId, subject: ['training.session', session.id] })
  if (place.state === 'booked') await promote(unit, session, 1)
  unit.announce('training.place.cancelled', { placeId, sessionId: session.id, accountId: place.accountId }, { record: ['training.session', session.id] })
  unit.audit({ action: 'state', record: ['training.session', session.id], detail: { place: placeId, state: 'cancelled', by } })
}

async function checkMarkWindow(session: Session): Promise<void> {
  const at = nowMs()
  if (session.status !== 'published' && session.status !== 'completed') refuse('training.session.not-open', 'Only a published session is marked.', { status: 409 })
  if (at < session.startsAt) refuse('training.attendance.too-early', 'Attendance is marked from the start of the session.', { status: 409 })
  if (at > session.endsAt + (await useSetting('training.sessions.mark-within') as number) * SECOND)
    refuse('training.attendance.too-late', 'The time for marking this session has passed.', { status: 409, remedy: 'Ask someone who can award training to record it directly.' })
}

/** The session's session steps, from the version it is held under (S6). */
async function sessionStepsOf(session: Session): Promise<string[]> {
  return (await all<{ id: string }>('SELECT id FROM training_course_steps WHERE version_id = ? AND kind = \'session\' ORDER BY position', session.versionId)).map(r => r.id)
}

/** Writes the attendance sign-offs for one attended place and evaluates the award (S6). */
interface Attendance { actor: Actor, course: Course, place: { id: string, accountId: string }, steps: string[], day: string }

async function signAttendance(unit: UnitView, { actor, course, place, steps, day }: Attendance): Promise<string | null> {
  const pending: PendingSignOff[] = steps.map(stepId => addSignOff(unit, { accountId: place.accountId, courseId: course.id, stepId, kind: 'attendance', signedBy: actor.accountId ?? null, occurredOn: day, placeId: place.id }))
  return pending.length ? evaluateAward(unit, course, await canonicalAccount(place.accountId), pending) : null
}

/** Voids the attendance sign-offs of a place marked absent after attended (S6). */
async function voidAttendance(unit: UnitView, actor: Actor, courseId: string, place: Place): Promise<void> {
  const signed = await all<{ id: string }>(
    'SELECT id FROM training_sign_offs s WHERE place_id = ? AND kind = \'attendance\' AND NOT EXISTS (SELECT 1 FROM training_sign_offs v WHERE v.voids_id = s.id)',
    place.id,
  )
  if (!signed.length) return
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO training_sign_offs (id, account_id, course_id, step_id, kind, signed_by, occurred_on, voids_id, note, created_at)
      SELECT j.value ->> 'void', s.account_id, s.course_id, s.step_id, 'void', ?, ?, s.id, 'Marked absent', ? FROM json_each(?) j JOIN training_sign_offs s ON s.id = j.value ->> 'id'`,
    params: [actor.accountId ?? null, await theatreDay(at), at, JSON.stringify(signed.map(r => ({ id: r.id, void: newId('tsof') })))],
  }).expect(signed.length)
  for (const row of signed) unit.announce('training.sign-off.voided', { signOffId: row.id, accountId: place.accountId, courseId }, { record: ['training.course', courseId] })
}

/**
 * Marks places attended or absent (S6, P7, TR-13): from the start until `mark-within` after the end,
 * never one's own place. Attended writes the session steps' sign-offs in the same unit; changing an
 * attended mark voids them.
 */
export async function markAttendance(unit: UnitView, actor: Actor, sessionId: string, marks: { placeId: string, state: 'attended' | 'absent' }[]): Promise<{ awarded: string[] }> {
  const session = await sessionOrRefuse(sessionId)
  await checkMarkWindow(session)
  const course = await courseOrRefuse(session.courseId)
  const places = new Map((await placesOf(sessionId)).map(p => [p.id, p]))
  const steps = await sessionStepsOf(session)
  const day = await theatreDay(session.startsAt)
  const at = nowMs()
  const awarded: string[] = []
  for (const mark of marks) {
    const place = places.get(mark.placeId)
    if (!place || place.state === 'waiting') refuse('training.place.not-found', 'A place marked is not a place on this session.', { status: 404 })
    if (await samePerson(actor.accountId, place.accountId)) refuse('training.own-attendance', 'You cannot mark your own attendance.', { status: 403, remedy: 'Ask another trainer of the course.' })
    if (place.state === mark.state) continue
    unit.add({
      sql: 'UPDATE training_session_places SET state = ?, marked_by = ?, marked_at = ?, updated_at = ? WHERE id = ? AND state = ?',
      params: [mark.state, actor.accountId ?? null, at, at, place.id, place.state],
    }).expect(1, { code: 'training.place.changed', reason: 'Someone else marked this place meanwhile.', remedy: 'Reload and try again.' })
    if (mark.state === 'attended') {
      const recordId = await signAttendance(unit, { actor, course, place, steps, day })
      if (recordId) awarded.push(recordId)
    }
    else if (place.state === 'attended') {
      await voidAttendance(unit, actor, course.id, place)
    }
  }
  unit.audit({ action: 'update', record: ['training.session', sessionId], detail: { marked: marks.length } })
  return { awarded }
}

/** Adds a walk-in and marks them attended in one act (P7, TR-12); capacity still applies. */
export async function addWalkIn(unit: UnitView, actor: Actor, sessionId: string, who: { accountId: string } | { name: string, address?: string | null }): Promise<{ placeId: string, accountId: string, recordId: string | null }> {
  const session = await sessionOrRefuse(sessionId)
  await checkMarkWindow(session)
  const accountId = 'accountId' in who
    ? await canonicalAccount(who.accountId)
    : (await findOrCreateAccount(unit, { address: who.address ?? null, name: who.name, origin: 'staff' })).accountId
  if (await samePerson(actor.accountId, accountId)) refuse('training.own-attendance', 'You cannot mark your own attendance.', { status: 403, remedy: 'Ask another trainer of the course.' })
  if (await placeFor(sessionId, accountId)) refuse('training.place.already', 'They already have a place on this session; mark it instead.', { status: 409 })
  const id = newId('tplc')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO training_session_places (id, session_id, account_id, state, counted, added_by, marked_by, marked_at, created_at, updated_at)
      SELECT ?1, ?2, ?3, 'attended', 1, ?4, ?4, ?5, ?5, ?5 WHERE (SELECT places_taken < capacity FROM training_sessions WHERE id = ?2) /* not-policy: bound parameters */`,
    params: [id, sessionId, accountId, actor.accountId ?? null, at],
  }).expect(1, { code: 'training.session.full', reason: 'This session is full.', remedy: 'Raise its capacity first if the room allows.' })
  const course = await courseOrRefuse(session.courseId)
  const recordId = await signAttendance(unit, { actor, course, place: { id, accountId }, steps: await sessionStepsOf(session), day: await theatreDay(session.startsAt) })
  unit.announce('training.place.booked', { placeId: id, sessionId, accountId, state: 'attended' }, { record: ['training.session', sessionId] })
  unit.audit({ action: 'create', record: ['training.session', sessionId], detail: { place: id, account: accountId, state: 'attended', by: 'walk-in' } })
  return { placeId: id, accountId, recordId }
}

/** Closes attendance once every counted place is marked (TR-13). */
export async function closeAttendance(unit: UnitView, sessionId: string): Promise<void> {
  const session = await sessionOrRefuse(sessionId)
  if (session.startsAt > nowMs()) refuse('training.attendance.too-early', 'Attendance is closed after the session has started.', { status: 409 })
  const at = nowMs()
  unit.add({
    sql: `UPDATE training_sessions SET status = 'completed', attendance_closed_at = ?, updated_at = ? WHERE id = ? AND status = 'published'
      AND NOT EXISTS (SELECT 1 FROM training_session_places WHERE session_id = training_sessions.id AND state = 'booked')`,
    params: [at, at, sessionId],
  }).expect(1, { code: 'training.session.unmarked', reason: 'Mark every place attended or absent first.' })
  unit.announce('training.session.completed', { sessionId, courseId: session.courseId }, { record: ['training.session', sessionId] })
  unit.audit({ action: 'state', record: ['training.session', sessionId], detail: { status: 'completed' } })
}

/**
 * Sends the reminders that have come due (P9): each booked person on a published session starting
 * within `training.sessions.reminder-before`, once, by the dedupe key of their place.
 */
export async function sendReminders(unit: UnitView): Promise<number> {
  const at = nowMs()
  const before = (await useSetting('training.sessions.reminder-before') as number) * SECOND
  const due = await all<{ placeId: string, accountId: string, sessionId: string }>(
    `SELECT p.id AS placeId, p.account_id AS accountId, s.id AS sessionId FROM training_session_places p JOIN training_sessions s ON s.id = p.session_id
      WHERE s.status = 'published' AND s.starts_at > ?1 AND s.starts_at <= ?2 AND p.state = 'booked'`,
    at, at + before,
  )
  const bySession = new Map<string, typeof due>()
  for (const row of due) bySession.set(row.sessionId, [...bySession.get(row.sessionId) ?? [], row])
  for (const [sessionId, rows] of bySession) {
    const session = (await getSession(sessionId))!
    await notify(unit, 'training.session-reminder', { to: rows.map(r => ({ accountId: r.accountId, dedupeKey: `reminder:${r.placeId}` })), variables: { session: nameOf(session), when: await whenOf(session), where: session.spaceName ?? session.placeNote ?? 'see your training page' }, subject: ['training.session', sessionId] })
  }
  return due.length
}
