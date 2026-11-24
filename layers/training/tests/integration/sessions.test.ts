// Sessions, places and attendance (TR-09 to TR-14; P1 to P11, S6).
import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, createUnit, setClock, type Actor } from '#kit'
import { isSpaceFree } from '#modules/core'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import createVenue from '../../../core/server/api/core/venues/index.post'
import { mergePlaces, undoMergePlaces } from '../../server/merge'
import { sendReminders } from '../../server/sessions'
import { DAY, liveCourse, MANAGER, NOV_24, ready, req, someone } from './stage'

beforeEach(ready)

const HOUR = 3_600_000
const START = NOV_24 + 3 * DAY // 27 November, 10:00

const venues = server({ 'POST /api/core/venues': createVenue })
async function space(): Promise<string> {
  const made = await call(venues, 'POST', '/api/core/venues', { actor: person(['core.venue.manage']), body: { name: `Venue ${Math.random()}` } })
  return (await made.json() as { spaceId: string }).spaceId
}

/** A published session of a course with one session step, starting at START unless told otherwise. */
async function session(manager: Actor, fields: Record<string, unknown> = {}, courseId?: string): Promise<{ sessionId: string, courseId: string }> {
  const course = courseId ?? (await liveCourse(manager, [{ kind: 'session', title: 'Come to a session' }])).courseId
  const made = await req(manager, 'POST', `/api/training/courses/${course}/sessions`, { startsAt: START, endsAt: START + 2 * HOUR, capacity: 2, ...fields })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const published = await req(manager, 'POST', `/api/training/sessions/${made.body.sessionId}/publish`, {})
  expect(published.status, JSON.stringify(published.body)).toBe(200)
  return { sessionId: made.body.sessionId, courseId: course }
}

const learner = (name?: string) => someone(['training.place.book', 'training.course.view'], name)

describe('scheduling a session (TR-09; P10, P11)', () => {
  it('is busy in its space once published, and refuses a second session over it', async () => {
    const manager = await someone(MANAGER)
    const room = await space()
    const { sessionId, courseId } = await session(manager, { spaceId: room })
    expect(await inContext(() => isSpaceFree(room, START + HOUR, START + 3 * HOUR))).toBe(false)
    const second = await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: START + HOUR, endsAt: START + 3 * HOUR, spaceId: room })
    const clash = await req(manager, 'POST', `/api/training/sessions/${second.body.sessionId}/publish`, {})
    expect(clash.status).toBe(409)
    expect(clash.body.code).toBe('training.session.space-taken')

    const listed = await req(await learner(), 'GET', '/api/training/sessions')
    expect(listed.body.sessions.map((s: any) => s.id)).toEqual([sessionId])
  })

  it('refuses a session in the past and a course not live', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [{ kind: 'session', title: 'S' }])
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: NOV_24 - HOUR, endsAt: NOV_24 })).body.code).toBe('training.session.past')
    await req(manager, 'POST', `/api/training/courses/${courseId}/retire`, {})
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: START, endsAt: START + HOUR })).body.code).toBe('training.course.not-live')
  })
})

describe('places (TR-10, TR-11; P1 to P4)', () => {
  it('takes the last place once when two press together, and offers the waiting list', async () => {
    const manager = await someone(MANAGER)
    const { sessionId } = await session(manager, { capacity: 1 })
    const [a, b] = [await learner('Ann'), await learner('Bob')]
    const [first, second] = await Promise.all([req(a, 'POST', `/api/training/sessions/${sessionId}/places`, {}), req(b, 'POST', `/api/training/sessions/${sessionId}/places`, {})])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
    const loser = first.status === 409 ? first : second
    expect(loser.body).toMatchObject({ code: 'training.session.full', remedy: 'Join the waiting list instead.' })
    expect(await rows('SELECT places_taken FROM training_sessions WHERE id = ?', sessionId)).toEqual([{ places_taken: 1 }])
  })

  it('puts the next person on the waiting list, promotes them when a place is freed, and tells them', async () => {
    const manager = await someone(MANAGER)
    const { sessionId } = await session(manager, { capacity: 1 })
    const [a, b] = [await learner('Ann'), await learner('Bob')]
    const booked = await req(a, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    expect(booked.body.state).toBe('booked')
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'training.place-booked\' AND account_id = ?', a.accountId)).toHaveLength(1)
    const waiting = await req(b, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    expect(waiting.body.state).toBe('waiting')
    expect((await req(b, 'POST', `/api/training/sessions/${sessionId}/places`, {})).body.code).toBe('training.place.already')

    const cancelled = await req(a, 'POST', `/api/training/places/${booked.body.placeId}/cancel`, {})
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect(await rows('SELECT state FROM training_session_places WHERE id = ?', waiting.body.placeId)).toEqual([{ state: 'booked' }])
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'training.place-promoted\' AND account_id = ?', b.accountId)).toHaveLength(1)
    expect((await req(b, 'GET', '/api/training/me/places')).body.places).toEqual([expect.objectContaining({ state: 'booked', sessionId })])
  })

  it('lets a person cancel only before the deadline, naming the trainer after it; promoted people may cancel up to the start', async () => {
    const manager = await someone(MANAGER, 'Tess Trainer')
    const { sessionId, courseId } = await session(manager, { capacity: 1 })
    await rows('INSERT INTO training_course_trainers (course_id, account_id, added_at) VALUES (?, ?, 0)', courseId, manager.accountId)
    const [a, b] = [await learner('Ann'), await learner('Bob')]
    const booked = await req(a, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    const waiting = await req(b, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    setClock(START - 12 * HOUR)
    const late = await req(a, 'POST', `/api/training/places/${booked.body.placeId}/cancel`, {})
    expect(late.status).toBe(409)
    expect(late.body).toMatchObject({ code: 'training.place.too-late', remedy: 'Tell Tess Trainer, who is running it.' })
    // Staff can still cancel; Bob is promoted and may cancel up to the start.
    expect((await req(manager, 'POST', `/api/training/places/${booked.body.placeId}/cancel`, {})).status).toBe(200)
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'training.place-cancelled-by-staff\' AND account_id = ?', a.accountId)).toHaveLength(1)
    expect((await req(b, 'POST', `/api/training/places/${waiting.body.placeId}/cancel`, {})).status).toBe(200)
  })

  it('refuses lowering capacity below the places taken, and raising it promotes', async () => {
    const manager = await someone(MANAGER)
    const { sessionId } = await session(manager, { capacity: 1 })
    const [a, b] = [await learner(), await learner()]
    await req(a, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    const waiting = await req(b, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    expect((await req(manager, 'PATCH', `/api/training/sessions/${sessionId}`, { capacity: 1 })).status).toBe(200)
    const raised = await req(manager, 'PATCH', `/api/training/sessions/${sessionId}`, { capacity: 3 })
    expect(raised.status, JSON.stringify(raised.body)).toBe(200)
    expect(await rows('SELECT state FROM training_session_places WHERE id = ?', waiting.body.placeId)).toEqual([{ state: 'booked' }])
    await req(manager, 'PATCH', `/api/training/sessions/${sessionId}`, { capacity: 3 })
    const below = await req(manager, 'PATCH', `/api/training/sessions/${sessionId}`, { capacity: 1 })
    expect(below.body.code).toBe('training.session.capacity-below-taken')
  })

  it('closes sign-up before the start and refuses invited-only sessions to self sign-up', async () => {
    const manager = await someone(MANAGER)
    const { sessionId } = await session(manager)
    const invited = await session(manager, { signUp: 'invited' })
    const a = await learner()
    expect((await req(a, 'POST', `/api/training/sessions/${invited.sessionId}/places`, {})).body.code).toBe('training.session.invited-only')
    expect((await req(manager, 'POST', `/api/training/sessions/${invited.sessionId}/places`, { accountId: a.accountId })).status).toBe(200)
    setClock(START - HOUR)
    expect((await req(a, 'POST', `/api/training/sessions/${sessionId}/places`, {})).body.code).toBe('training.session.sign-up-closed')
  })
})

describe('changes and cancellation (TR-14; P5, P9)', () => {
  it('tells everyone with a place when a session moves, again when it moves back, and when it is cancelled', async () => {
    const manager = await someone(MANAGER)
    const { sessionId } = await session(manager)
    const a = await learner()
    const place = await req(a, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    await req(manager, 'PATCH', `/api/training/sessions/${sessionId}`, { startsAt: START + HOUR, endsAt: START + 3 * HOUR })
    await req(manager, 'PATCH', `/api/training/sessions/${sessionId}`, { startsAt: START, endsAt: START + 2 * HOUR })
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'training.session-changed\' AND account_id = ?', a.accountId)).toHaveLength(2)
    const cancelled = await req(manager, 'POST', `/api/training/sessions/${sessionId}/cancel`, { reason: 'The trainer is ill' })
    expect(cancelled.status).toBe(200)
    expect(await rows('SELECT state, cancel_kind FROM training_session_places WHERE id = ?', place.body.placeId)).toEqual([{ state: 'cancelled', cancel_kind: 'session-cancelled' }])
    expect(await rows('SELECT places_taken FROM training_sessions WHERE id = ?', sessionId)).toEqual([{ places_taken: 0 }])
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'training.session-cancelled\' AND account_id = ?', a.accountId)).toHaveLength(1)
  })

  it('reminds booked people once when the session is within the reminder window', async () => {
    const manager = await someone(MANAGER)
    const { sessionId } = await session(manager)
    const a = await learner()
    await req(a, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    const remind = () => inContext(async () => {
      const unit = createUnit()
      const n = await sendReminders(unit.view())
      await unit.commit()
      return n
    })
    expect(await remind()).toBe(0)
    setClock(START - 23 * HOUR)
    await remind()
    await remind()
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'training.session-reminder\' AND account_id = ?', a.accountId)).toHaveLength(1)
  })
})

describe('attendance (TR-12, TR-13; S6, P7)', () => {
  it('signs off the session step and awards in the same unit; marking absent voids it; closing needs every place marked', async () => {
    const trainer = await someone(MANAGER, 'Tess Trainer')
    const { sessionId, courseId } = await session(trainer)
    const [a, b] = [await learner(), await learner()]
    const pa = await req(a, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    const pb = await req(b, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    expect((await req(trainer, 'PUT', `/api/training/sessions/${sessionId}/attendance`, { marks: [{ placeId: pa.body.placeId, state: 'attended' }] })).body.code).toBe('training.attendance.too-early')

    setClock(START + 3 * HOUR)
    const marked = await req(trainer, 'PUT', `/api/training/sessions/${sessionId}/attendance`, { marks: [{ placeId: pa.body.placeId, state: 'attended' }] })
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    expect(marked.body.awarded).toHaveLength(1)
    expect(await rows('SELECT kind, occurred_on, place_id FROM training_sign_offs WHERE account_id = ?', a.accountId)).toEqual([{ kind: 'attendance', occurred_on: '2026-11-27', place_id: pa.body.placeId }])
    expect((await req(trainer, 'POST', `/api/training/sessions/${sessionId}/close`, {})).body.code).toBe('training.session.unmarked')

    await req(trainer, 'PUT', `/api/training/sessions/${sessionId}/attendance`, { marks: [{ placeId: pa.body.placeId, state: 'absent' }, { placeId: pb.body.placeId, state: 'absent' }] })
    expect(await rows('SELECT kind FROM training_sign_offs WHERE account_id = ? ORDER BY created_at', a.accountId)).toEqual([{ kind: 'attendance' }, { kind: 'void' }])
    expect((await req(trainer, 'POST', `/api/training/sessions/${sessionId}/close`, {})).status).toBe(200)
    expect(await rows('SELECT status FROM training_sessions WHERE id = ?', sessionId)).toEqual([{ status: 'completed' }])
    void courseId
  })

  it('adds a walk-in without an account, marked attended, and never lets a trainer mark themself', async () => {
    const trainer = await someone(MANAGER)
    const { sessionId } = await session(trainer)
    setClock(START + HOUR)
    const walkIn = await req(trainer, 'POST', `/api/training/sessions/${sessionId}/walk-ins`, { name: 'Wally Walkin', address: 'wally@example.org' })
    expect(walkIn.status, JSON.stringify(walkIn.body)).toBe(200)
    expect(walkIn.body.recordId).toMatch(/^trec_/)
    expect(await rows('SELECT name FROM core_accounts WHERE id = ?', walkIn.body.accountId)).toEqual([{ name: 'Wally Walkin' }])
    const own = await req(trainer, 'POST', `/api/training/sessions/${sessionId}/walk-ins`, { accountId: trainer.accountId })
    expect(own.body.code).toBe('training.own-attendance')
    advanceClock(10 * DAY)
    expect((await req(trainer, 'POST', `/api/training/sessions/${sessionId}/walk-ins`, { name: 'Too late' })).body.code).toBe('training.attendance.too-late')
  })
})

describe('two accounts merged with a place each on one session', () => {
  const run = <T>(fn: (unit: ReturnType<ReturnType<typeof createUnit>['view']>) => Promise<T>) => inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit.view())
    await unit.commit()
    return out
  })

  it('keeps the stronger place, cancels the other by the merge, and undo puts it back on the waiting list', async () => {
    const manager = await someone(MANAGER)
    const { sessionId } = await session(manager, { capacity: 3 })
    const [keep, lose] = [await learner('Kim'), await learner('Kim again')]
    const lost = (await req(lose, 'POST', `/api/training/sessions/${sessionId}/places`, {})).body.placeId as string
    await req(keep, 'POST', `/api/training/sessions/${sessionId}/places`, {})
    const ref = { mergeId: `mrg_${Date.now()}`, survivorId: keep.accountId!, mergedAccountId: lose.accountId! }
    await rows('INSERT INTO core_account_merges (id, survivor_id, merged_account_id, started_by, performed_by, performed_at, undo_until) VALUES (?, ?, ?, \'staff\', ?, ?, ?)', ref.mergeId, ref.survivorId, ref.mergedAccountId, ref.survivorId, NOV_24, NOV_24 + 30 * DAY)

    // Both are booked, so the older place is kept.
    await run(unit => mergePlaces(unit, ref))
    await run(unit => mergePlaces(unit, ref))
    expect(await rows('SELECT state, cancel_kind FROM training_session_places WHERE session_id = ? AND state != \'cancelled\'', sessionId)).toEqual([{ state: 'booked', cancel_kind: null }])
    expect(await rows('SELECT id FROM training_session_places WHERE session_id = ? AND state != \'cancelled\'', sessionId)).toEqual([{ id: lost }])
    expect(await rows('SELECT places_taken FROM training_sessions WHERE id = ?', sessionId)).toEqual([{ places_taken: 1 }])

    expect(await run(unit => undoMergePlaces(unit, ref))).toEqual({ notRestored: 0 })
    expect(await rows('SELECT state FROM training_session_places WHERE session_id = ? AND state != \'cancelled\' ORDER BY state', sessionId)).toEqual([{ state: 'booked' }, { state: 'waiting' }])
  })
})
