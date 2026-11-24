// The console's competencies and evidence (K8, K9): the competency list with its courses and holders,
// what a route may be built from, and the evidence queue naming whose evidence it is.
import { beforeEach, describe, expect, it } from 'vitest'
import { inContext, rows } from '../../../../tests/integration/helpers'
import waitingCount from '../../server/contributions/core.count/evidence-waiting'
import type { Actor } from '#kit'
import { DAY, MANAGER, liveCourse, ready, req, someone } from './stage'

beforeEach(ready)

async function competency(manager: Actor, title: string, courseIds: string[]): Promise<string> {
  const made = await req(manager, 'POST', '/api/training/competencies', { title })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const routes = courseIds.map((courseId, i) => ({ label: `Route ${i + 1}`, items: [{ kind: 'course', courseId }] }))
  expect((await req(manager, 'PUT', `/api/training/competencies/${made.body.competencyId}/routes`, { routes })).status).toBe(200)
  expect((await req(manager, 'POST', `/api/training/competencies/${made.body.competencyId}/activate`, {})).status).toBe(200)
  return made.body.competencyId
}

async function award(manager: Actor, courseId: string, name: string) {
  const who = await someone(['training.course.view'], name)
  const expiresOn = new Date(Date.now() + 90 * DAY).toISOString().slice(0, 10)
  expect((await req(manager, 'POST', `/api/training/courses/${courseId}/awards`, { accountId: who.accountId, reason: 'Trained before the system', expiresOn })).status).toBe(200)
}

const ids = (body: { rows: { id: string }[] }) => body.rows.map(r => r.id)

describe('the console competency list (K8)', () => {
  it('shows each competency with its courses, how many routes it has and how many hold it now', async () => {
    const manager = await someone(MANAGER)
    const fire = await liveCourse(manager, undefined, { title: 'Fire safety' })
    const aid = await liveCourse(manager, undefined, { title: 'First aid' })
    const marshal = await competency(manager, 'Fire marshal', [fire.courseId, aid.courseId])
    await award(manager, fire.courseId, 'Ada Lovelace')
    await award(manager, aid.courseId, 'Ben Okafor')

    const listed = await req(manager, 'GET', '/api/training/console/competencies?q=marshal')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body.rows).toEqual([expect.objectContaining({ id: marshal, title: 'Fire marshal', status: 'active', routes: 2, courses: ['Fire safety', 'First aid'], holders: 2 })])
  })

  it('keeps retired competencies to their own view, and is refused to anyone who does not manage them', async () => {
    const manager = await someone(MANAGER)
    const course = await liveCourse(manager)
    const kept = await competency(manager, 'Duty manager', [course.courseId])
    const old = await competency(manager, 'Old duty manager', [course.courseId])
    expect((await req(manager, 'POST', `/api/training/competencies/${old}/retire`, {})).status).toBe(200)

    expect(ids((await req(manager, 'GET', '/api/training/console/competencies?q=duty')).body)).toEqual([kept])
    expect(ids((await req(manager, 'GET', '/api/training/console/competencies?view=retired&q=duty')).body)).toEqual([old])
    expect((await req(await someone(['training.course.view']), 'GET', '/api/training/console/competencies')).status).toBe(403)
  })
})

describe('what a route is built from (K8)', () => {
  it('offers every course not retired, and what other modules recognise but never Training itself', async () => {
    const manager = await someone(MANAGER)
    const live = await liveCourse(manager, undefined, { title: 'Sound desk' })
    const draft = await req(manager, 'POST', '/api/training/courses', { title: 'Lighting desk', expires: false })
    const gone = await liveCourse(manager, undefined, { title: 'Old till' })
    expect((await req(manager, 'POST', `/api/training/courses/${gone.courseId}/retire`, {})).status).toBe(200)

    const options = await req(manager, 'GET', '/api/training/competencies/route-options')
    expect(options.status, JSON.stringify(options.body)).toBe(200)
    const courses = options.body.courses.map((c: any) => c.value)
    expect(courses).toEqual(expect.arrayContaining([live.courseId, draft.body.courseId]))
    expect(courses).not.toContain(gone.courseId)
    expect(options.body.recognised.every((o: any) => !o.value.startsWith('training') && !o.value.startsWith('fact:training.'))).toBe(true)
    expect((await req(await someone(['training.course.view']), 'GET', '/api/training/competencies/route-options')).status).toBe(403)
  })
})

describe('the evidence queue (K9)', () => {
  it('names whose evidence each piece is, and counts what waits for the verifier', async () => {
    const verifier = await someone([...MANAGER, 'training.evidence.verify'])
    const { courseId } = await liveCourse(verifier, [{ kind: 'certificate', title: 'First aid at work', evidenceExpiry: 'required', evidenceFile: 'optional' }])
    const [step] = await rows<{ id: string }>('SELECT id FROM training_course_steps WHERE version_id = (SELECT live_version_id FROM training_courses WHERE id = ?)', courseId)
    const person = await someone(['training.course.view'], 'Cat Nguyen')
    const before = await inContext(() => waitingCount.value(verifier))
    const sent = await req(person, 'POST', `/api/training/courses/${courseId}/evidence`, { stepId: step!.id, issuer: 'St John Ambulance', issuedOn: '2026-01-10', expiresOn: '2029-01-10' })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)

    const queue = await req(verifier, 'GET', `/api/training/evidence?courseId=${courseId}`)
    expect(queue.body.evidence.map((e: any) => [e.person, e.course])).toEqual([['Cat Nguyen', expect.any(String)]])
    expect(await inContext(() => waitingCount.value(verifier))).toBe(before + 1)
    expect(await inContext(() => waitingCount.value(person))).toBe(0)
  })
})
