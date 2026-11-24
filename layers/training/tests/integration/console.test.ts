// The console's courses (K1, K2): the list with each course's state, live version, holders and those
// lapsing soon, and the figures over a course's tabs.
import { beforeEach, describe, expect, it } from 'vitest'
import { DAY, MANAGER, NOV_24, liveCourse, ready, req, someone } from './stage'

beforeEach(ready)

const HOUR = 3_600_000

async function award(manager: Awaited<ReturnType<typeof someone>>, courseId: string, expiresOn: string, name: string) {
  const who = await someone(['training.course.view'], name)
  const given = await req(manager, 'POST', `/api/training/courses/${courseId}/awards`, { accountId: who.accountId, reason: 'Trained before the system', expiresOn })
  expect(given.status, JSON.stringify(given.body)).toBe(200)
}

describe('the console course list (K1)', () => {
  it('shows each course with its state, live version, holders and those lapsing within the warning', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, undefined, { title: 'Fly floor' })
    await award(manager, courseId, '2027-06-30', 'Ada Lovelace')
    await award(manager, courseId, '2026-12-10', 'Ben Okafor')
    const draft = await req(manager, 'POST', '/api/training/courses', { title: 'Lighting desk', expires: false })

    const listed = await req(manager, 'GET', '/api/training/console/courses')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    const fly = listed.body.rows.find((r: any) => r.id === courseId)
    expect(fly).toMatchObject({ title: 'Fly floor', status: 'live', version: 1, preparing: false, current: 2, lapsing: 1 })
    expect(listed.body.rows.find((r: any) => r.id === draft.body.courseId)).toMatchObject({ status: 'unpublished', version: null, preparing: true, current: 0, lapsing: 0 })
  })

  it('leaves retired courses to their own view, and searches by title', async () => {
    const manager = await someone(MANAGER)
    const kept = await liveCourse(manager, undefined, { title: 'Box office till' })
    const old = await liveCourse(manager, undefined, { title: 'Old till' })
    expect((await req(manager, 'POST', `/api/training/courses/${old.courseId}/retire`, {})).status).toBe(200)

    const active = (await req(manager, 'GET', '/api/training/console/courses')).body.rows.map((r: any) => r.id)
    expect(active).toContain(kept.courseId)
    expect(active).not.toContain(old.courseId)
    const retired = (await req(manager, 'GET', '/api/training/console/courses?view=retired')).body.rows.map((r: any) => r.id)
    expect(retired).toEqual([old.courseId])
    const found = (await req(manager, 'GET', '/api/training/console/courses?view=all&q=box%20off')).body
    expect(found.rows.map((r: any) => r.id)).toEqual([kept.courseId])
    expect(found.total).toBe(1)
  })

  it('is refused to someone who does not manage courses', async () => {
    const reader = await someone(['training.course.view'])
    expect((await req(reader, 'GET', '/api/training/console/courses')).status).toBe(403)
  })
})

describe('a course in the console (K2)', () => {
  it('gives a manager the holders, those lapsing and the next session over the tabs', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [{ kind: 'session', title: 'Come along' }])
    await award(manager, courseId, '2026-12-01', 'Cat Nguyen')
    const later = await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: NOV_24 + 9 * DAY, endsAt: NOV_24 + 9 * DAY + HOUR })
    const sooner = await req(manager, 'POST', `/api/training/courses/${courseId}/sessions`, { startsAt: NOV_24 + 2 * DAY, endsAt: NOV_24 + 2 * DAY + HOUR })
    expect(later.status).toBe(200)

    const seen = await req(manager, 'GET', `/api/training/courses/${courseId}`)
    expect(seen.body.overview).toEqual({ holders: 1, lapsing: 1, nextSession: { id: sooner.body.sessionId, startsAt: NOV_24 + 2 * DAY } })

    const reader = await someone(['training.course.view'])
    expect((await req(reader, 'GET', `/api/training/courses/${courseId}`)).body.overview).toBeNull()
  })

  it('names the trainers of the course', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager)
    const trainer = await someone(['training.course.view'], 'Terry Trainer')
    const found = await req(manager, 'GET', '/api/training/console/people?q=Terry')
    expect(found.body.people.map((p: any) => p.id)).toContain(trainer.accountId)
    expect((await req(trainer, 'GET', '/api/training/console/people?q=Terry')).status).toBe(403)
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/trainers`, { accountId: trainer.accountId })).status).toBe(200)
    expect((await req(manager, 'GET', `/api/training/courses/${courseId}`)).body.trainers).toEqual([{ accountId: trainer.accountId, name: 'Terry Trainer', addedAt: NOV_24 }])
  })
})
