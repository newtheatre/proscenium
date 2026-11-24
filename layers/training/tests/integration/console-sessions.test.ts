// The console's sessions (K3, K4): the list with places taken of capacity, those waiting and what still
// needs marking, the choices a new session is made from, and finding a person to give a place to.
import { beforeEach, describe, expect, it } from 'vitest'
import { setClock, type Actor } from '#kit'
import { call, inContext, person, server } from '../../../../tests/integration/helpers'
import createVenue from '../../../core/server/api/core/venues/index.post'
import unmarkedCount from '../../server/contributions/core.count/sessions-unmarked'
import { DAY, MANAGER, NOV_24, liveCourse, ready, req, someone } from './stage'

beforeEach(ready)

const HOUR = 3_600_000
const venues = server({ 'POST /api/core/venues': createVenue })

async function schedule(manager: Actor, courseId: string, startsAt: number, fields: Record<string, unknown> = {}): Promise<string> {
  const made = await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt, endsAt: startsAt + 2 * HOUR, capacity: 2, ...fields })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.sessionId
}

async function publish(manager: Actor, sessionId: string) {
  expect((await req(manager, 'POST', `/api/training/sessions/${sessionId}/publish`, {})).status).toBe(200)
}

async function give(manager: Actor, sessionId: string, name: string) {
  const who = await someone(['training.course.view'], name)
  const given = await req(manager, 'POST', `/api/training/sessions/${sessionId}/places`, { accountId: who.accountId })
  expect(given.status, JSON.stringify(given.body)).toBe(200)
}

const ids = (body: { rows: { id: string }[] }) => body.rows.map(r => r.id)

describe('the console session list (K3)', () => {
  it('shows each session with its course, places taken of capacity, those waiting and its state', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }], { title: 'Fly floor' })
    const soon = await schedule(manager, courseId, NOV_24 + 2 * DAY, { title: 'Fly floor taster' })
    await publish(manager, soon)
    for (const name of ['Ada Lovelace', 'Ben Okafor', 'Cat Nguyen']) await give(manager, soon, name)
    const draft = await schedule(manager, courseId, NOV_24 + 5 * DAY)

    const listed = await req(manager, 'GET', `/api/training/console/sessions?course=${courseId}`)
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(ids(listed.body)).toEqual([soon, draft])
    expect(listed.body.rows[0]).toMatchObject({ courseId, courseTitle: 'Fly floor', title: 'Fly floor taster', startsAt: NOV_24 + 2 * DAY, capacity: 2, placesTaken: 2, waiting: 1, status: 'published' })
    expect(listed.body.rows[1]).toMatchObject({ status: 'unpublished', placesTaken: 0, waiting: 0 })
  })

  it('keeps past sessions to their own views and puts those still to mark in theirs', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }])
    const today = await schedule(manager, courseId, NOV_24 + HOUR)
    await publish(manager, today)
    await give(manager, today, 'Dee Marsh')
    const later = await schedule(manager, courseId, NOV_24 + 3 * DAY)
    const called = await schedule(manager, courseId, NOV_24 + 4 * DAY)
    expect((await req(manager, 'POST', `/api/training/sessions/${called}/cancel`, { reason: 'Trainer unwell' })).status).toBe(200)
    const before = await inContext(() => unmarkedCount.value(manager))
    setClock(NOV_24 + DAY)

    const view = async (name?: string) => ids((await req(manager, 'GET', `/api/training/console/sessions?course=${courseId}${name ? `&view=${name}` : ''}`)).body)
    expect(await view()).toEqual([later])
    expect(await view('unmarked')).toEqual([today])
    expect(await view('past')).toEqual([today])
    expect(await view('cancelled')).toEqual([called])
    expect(await inContext(() => unmarkedCount.value(manager))).toBe(before + 1)
    expect(await inContext(() => unmarkedCount.value(person(['training.course.view'])))).toBe(0)
  })

  it('filters by course and searches by title', async () => {
    const manager = await someone(MANAGER)
    const fly = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }], { title: 'Fly floor' })
    const till = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }], { title: 'Box office till' })
    const flying = await schedule(manager, fly.courseId, NOV_24 + 2 * DAY)
    const selling = await schedule(manager, till.courseId, NOV_24 + 3 * DAY)

    expect(ids((await req(manager, 'GET', `/api/training/console/sessions?course=${fly.courseId}`)).body)).toEqual([flying])
    const found = (await req(manager, 'GET', '/api/training/console/sessions?q=box%20off')).body
    expect(ids(found)).toEqual([selling])
    expect(found.total).toBe(1)
  })

  it('is open to whoever gives places, and refused to anyone else', async () => {
    const giver = await someone(['training.place.manage', 'training.course.view'])
    expect((await req(giver, 'GET', '/api/training/console/sessions')).status).toBe(200)
    const reader = await someone(['training.course.view'])
    expect((await req(reader, 'GET', '/api/training/console/sessions')).status).toBe(403)
  })
})

describe('making a session from the console', () => {
  it('offers live courses, the theatre\'s own spaces and the usual capacity', async () => {
    const manager = await someone(MANAGER)
    const live = await liveCourse(manager, undefined, { title: 'Fly floor' })
    const draft = await req(manager, 'POST', '/api/training/courses', { title: 'Lighting desk', expires: false })
    const made = await call(venues, 'POST', '/api/core/venues', { actor: person(['core.venue.manage']), body: { name: 'Studio theatre' } })
    const { spaceId } = await made.json() as { spaceId: string }

    const options = await req(manager, 'GET', '/api/training/console/session-options')
    expect(options.status, JSON.stringify(options.body)).toBe(200)
    expect(options.body.courses).toContainEqual({ value: live.courseId, label: 'Fly floor' })
    expect(options.body.courses.map((c: any) => c.value)).not.toContain(draft.body.courseId)
    expect(options.body.spaces).toContainEqual({ value: spaceId, label: 'Studio theatre' })
    expect(options.body.capacity).toBe(12)
    expect(options.body.create).toBe(true)
    expect((await req(await someone(['training.place.manage', 'training.course.view']), 'GET', '/api/training/console/session-options')).body.create).toBe(false)

    expect((await req(await someone(['training.course.view']), 'GET', '/api/training/console/session-options')).status).toBe(403)
  })
})

describe('a session in the console (K4)', () => {
  it('lets whoever gives places add a person without being able to book for themselves', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }])
    const sessionId = await schedule(manager, courseId, NOV_24 + 2 * DAY)
    await publish(manager, sessionId)
    const giver = await someone(['training.place.manage', 'training.course.view'])
    const priya = await someone(['training.course.view'], 'Priya Shah')
    const given = await req(giver, 'POST', `/api/training/sessions/${sessionId}/places`, { accountId: priya.accountId })
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    expect((await req(giver, 'POST', `/api/training/sessions/${sessionId}/places`, {})).status).toBe(403)
  })

  it('finds people for whoever gives places on it', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }])
    const sessionId = await schedule(manager, courseId, NOV_24 + 2 * DAY)
    const priya = await someone(['training.course.view'], 'Priya Shah')

    const found = await req(manager, 'GET', `/api/training/sessions/${sessionId}/people?q=Priya`)
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.people.map((p: any) => p.id)).toContain(priya.accountId)
    expect((await req(priya, 'GET', `/api/training/sessions/${sessionId}/people?q=Priya`)).status).toBe(403)
  })
})
