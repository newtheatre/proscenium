// Courses, versions and trainers (TR-01 to TR-04; V1 to V8).
import { beforeEach, describe, expect, it } from 'vitest'
import { inContext, rows, setModule } from '../../../../tests/integration/helpers'
import courseTrainer from '../../server/facts/course-trainer'
import { liveCourse, MANAGER, ready, req, someone } from './stage'

beforeEach(ready)

describe('switching Training on and off (TR-01)', () => {
  it('answers nothing while off and everything again once on, keeping every row', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager)
    await setModule('training', false)
    expect((await req(manager, 'GET', `/api/training/courses/${courseId}`)).status).toBe(404)
    await setModule('training', true)
    const back = await req(manager, 'GET', `/api/training/courses/${courseId}`)
    expect(back.status).toBe(200)
    expect(back.body.course.status).toBe('live')
  })
})

describe('creating a course (TR-02)', () => {
  it('saves a course with version 1 in preparation and its steps', async () => {
    const manager = await someone(MANAGER)
    const made = await req(manager, 'POST', '/api/training/courses', { title: 'Fire safety', expires: true })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const saved = await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: [
      { kind: 'session', title: 'Walk the building' },
      { kind: 'practical', title: 'Use an extinguisher', timesRequired: 2 },
      { kind: 'certificate', title: 'Outside fire marshal certificate', neededFor: 'first', evidenceExpiry: 'required', evidenceFile: 'optional' },
    ] })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const course = await req(manager, 'GET', `/api/training/courses/${made.body.courseId}`)
    expect(course.body.course.status).toBe('unpublished')
    expect(course.body.course.slug).toBe('fire-safety')
    // The default validity, two years in seconds.
    expect(course.body.course.validFor).toBe(730 * 86_400)
    expect(course.body.preparing.steps.map((s: any) => [s.position, s.kind, s.timesRequired])).toEqual([[1, 'session', 1], [2, 'practical', 2], [3, 'certificate', 1]])
  })

  it('refuses a validity no longer than the warning before lapsing', async () => {
    const manager = await someone(MANAGER)
    const made = await req(manager, 'POST', '/api/training/courses', { title: 'Too short', expires: true, validFor: 30 * 86_400 })
    expect(made.status).toBe(422)
    expect(made.body.code).toBe('training.course.valid-for-short')
  })

  it('refuses more than twenty steps, and none at all', async () => {
    const manager = await someone(MANAGER)
    const made = await req(manager, 'POST', '/api/training/courses', { title: 'Many steps', expires: false })
    const many = Array.from({ length: 21 }, (_, i) => ({ kind: 'practical', title: `Step ${i + 1}` }))
    expect((await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: many })).status).toBe(422)
    expect((await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: [] })).status).toBe(422)
  })

  it('gives a second course with the same title its own address', async () => {
    const manager = await someone(MANAGER)
    const a = await req(manager, 'POST', '/api/training/courses', { title: 'Till training', expires: false })
    const b = await req(manager, 'POST', '/api/training/courses', { title: 'Till training', expires: false })
    const slugs = (await rows<{ slug: string }>('SELECT slug FROM training_courses WHERE id IN (?, ?) ORDER BY created_at, id', a.body.courseId, b.body.courseId)).map(r => r.slug)
    expect(new Set(slugs).size).toBe(2)
  })
})

describe('publishing a course (TR-03)', () => {
  it('makes version 1 live in one write, shows it to members, and never edits it again', async () => {
    const manager = await someone(MANAGER)
    const member = await someone(['training.course.view'])
    const made = await req(manager, 'POST', '/api/training/courses', { title: 'Bar induction', expires: false })
    expect((await req(manager, 'POST', `/api/training/courses/${made.body.courseId}/publish`, {})).body.code).toBe('training.version.no-steps')
    // Not published yet: a member cannot see it.
    expect((await req(member, 'GET', `/api/training/courses/${made.body.courseId}`)).status).toBe(404)
    await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: [{ kind: 'reading', title: 'Read the licensing rules', materialUrl: 'https://example.org/rules' }] })
    const published = await req(manager, 'POST', `/api/training/courses/${made.body.courseId}/publish`, {})
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    expect(published.body.number).toBe(1)

    const seen = await req(member, 'GET', `/api/training/courses/${made.body.courseId}`)
    expect(seen.status).toBe(200)
    expect(seen.body.live).toHaveLength(1)
    expect((await req(member, 'GET', '/api/training/courses')).body.courses.map((c: any) => c.id)).toContain(made.body.courseId)

    const edit = await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: [{ kind: 'practical', title: 'Changed' }] })
    expect(edit.status).toBe(409)
    expect(edit.body.code).toBe('training.version-published')
    const [event] = await rows<{ name: string }>('SELECT name FROM core_events WHERE record_id = ? AND name = \'training.course.published\'', made.body.courseId)
    expect(event).toBeDefined()
  })

  it('asks whether records stand for a later version and copies the steps, each carrying from its original (V1, V4)', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await liveCourse(manager, [{ kind: 'practical', title: 'Pull a pint' }, { kind: 'reading', title: 'Licensing' }])
    const started = await req(manager, 'POST', `/api/training/courses/${courseId}/versions`)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/versions`)).body.code).toBe('training.version.preparing')
    const course = await req(manager, 'GET', `/api/training/courses/${courseId}`)
    expect(course.body.preparing.steps.map((s: any) => s.carriesStepId)).toEqual(stepIds)
    // Retitling keeps the carry; changing the kind clears it (V3).
    const [first, second] = course.body.preparing.steps
    await req(manager, 'PUT', `/api/training/courses/${courseId}/steps`, { steps: [
      { id: first.id, kind: 'practical', title: 'Pull a pint properly' },
      { id: second.id, kind: 'practical', title: 'Licensing, shown' },
    ] })
    const after = await req(manager, 'GET', `/api/training/courses/${courseId}`)
    expect(after.body.preparing.steps.map((s: any) => s.carriesStepId)).toEqual([stepIds[0], null])
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/publish`, {})).body.code).toBe('training.version.change-kind')
    const published = await req(manager, 'POST', `/api/training/courses/${courseId}/publish`, { changeKind: 'records-stand', changeNote: 'Clearer wording' })
    expect(published.body.number).toBe(2)
    const versions = await rows<{ number: number, status: string }>('SELECT number, status FROM training_course_versions WHERE course_id = ? ORDER BY number', courseId)
    expect(versions).toEqual([{ number: 1, status: 'replaced' }, { number: 2, status: 'live' }])
  })

  it('retires and brings back a course', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager)
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/retire`)).status).toBe(200)
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/retire`)).body.code).toBe('training.course.not-live')
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/revive`)).status).toBe(200)
  })
})

describe('trainers (TR-04)', () => {
  it('adds and removes a course\'s trainers, and the fact holds at that course only', async () => {
    const manager = await someone(MANAGER)
    const trainer = await someone(['training.course.view'], 'Tess Trainer')
    const { courseId } = await liveCourse(manager)
    const other = await liveCourse(manager)
    expect((await req(manager, 'POST', `/api/training/courses/${courseId}/trainers`, { accountId: trainer.accountId })).status).toBe(200)
    // Naming the same person twice changes nothing.
    await req(manager, 'POST', `/api/training/courses/${courseId}/trainers`, { accountId: trainer.accountId })
    expect((await req(manager, 'GET', `/api/training/courses/${courseId}`)).body.trainers.map((t: any) => t.accountId)).toEqual([trainer.accountId])

    expect(await inContext(() => Promise.resolve(courseTrainer(trainer, { type: 'training.course', id: courseId })))).toBe(true)
    expect(await inContext(() => Promise.resolve(courseTrainer(trainer, { type: 'training.course', id: other.courseId })))).toBe(false)
    expect(await inContext(() => courseTrainer.holders!({ type: 'training.course', id: courseId }))).toEqual([trainer.accountId])

    // Without course.manage nobody names trainers.
    expect((await req(trainer, 'POST', `/api/training/courses/${courseId}/trainers`, { accountId: trainer.accountId })).status).toBe(403)
    expect((await req(manager, 'DELETE', `/api/training/courses/${courseId}/trainers/${trainer.accountId}`)).status).toBe(200)
    expect(await inContext(() => Promise.resolve(courseTrainer(trainer, { type: 'training.course', id: courseId })))).toBe(false)
  })
})
