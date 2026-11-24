// Activity steps signed off by a step source (TR-49; H1 to H4), with the fixture source `stint.shift`
// standing in for Front of house's shadowed shift.
import { beforeEach, describe, expect, it } from 'vitest'
import { createUnit, newId, type Actor } from '#kit'
import { inContext, rows, setModule } from '../../../../tests/integration/helpers'
import { shifts } from '../../../../tests/fixtures/modules/stint/server/contributions/training.step-source/shift'
import confirmed from '../../server/listeners/step-source-confirmed'
import sweep from '../../server/tasks/sweep-records'
import { MANAGER, NOV_24, liveCourse, ready, req, someone } from './stage'

beforeEach(async () => {
  await ready()
  await setModule('stint', true)
  shifts.length = 0
})

const SHADOWED = { kind: 'activity', title: 'Shadow two shifts', sourceId: 'stint.shift', sourceParams: { role: 'Duty manager' }, timesRequired: 2 }
const learner = () => someone(['training.course.view'])

function worked(person: Actor, on: string, confirmedBy: string | null, role = 'Duty manager'): string {
  const id = newId('sft')
  shifts.push({ id, accountId: person.accountId!, role, on, confirmedBy })
  return id
}

async function announce(person: Actor, shiftId: string): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await confirmed({ id: newId('evt'), name: 'stint.shift.confirmed', recordType: null, recordId: null, payload: { shiftId, accountId: person.accountId }, announcedAt: NOV_24 }, unit.view())
    await unit.commit()
  })
}

async function runSweep(): Promise<void> {
  await inContext(async () => sweep(createUnit().view(), { dueAt: NOV_24 }))
}

const activitySignOffs = (person: Actor, courseId: string) => rows<{ source_ref: string, occurred_on: string, confirmed_by: string }>(
  'SELECT source_ref, occurred_on, confirmed_by FROM training_sign_offs WHERE account_id = ? AND course_id = ? AND kind = \'activity\' ORDER BY occurred_on', person.accountId, courseId)

describe('choosing a step source (H1)', () => {
  it('lists the sources of modules switched on, and refuses an unknown source or parameters it does not accept', async () => {
    const manager = await someone(MANAGER)
    expect((await req(manager, 'GET', '/api/training/step-sources')).body.sources).toEqual([
      { id: 'stint.shift', module: 'stint', label: 'stint.shift.label', picker: null, ability: null },
    ])
    const made = await req(manager, 'POST', '/api/training/courses', { title: 'Duty manager', expires: false })
    const unknown = await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: [{ ...SHADOWED, sourceId: 'nobody.nothing' }] })
    expect(unknown.body.code).toBe('training.step.source-unknown')
    const bad = await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: [{ ...SHADOWED, sourceParams: { duty: 'x' } }] })
    expect(bad.body.code).toBe('training.step.source-params')

    await setModule('stint', false)
    expect((await req(manager, 'GET', '/api/training/step-sources')).body.sources).toEqual([])
    expect((await req(manager, 'PUT', `/api/training/courses/${made.body.courseId}/steps`, { steps: [SHADOWED] })).body.code).toBe('training.step.source-unknown')
  })

  it('keeps the source and its parameters on the step, and copies them into the next version', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager, [SHADOWED])
    await req(manager, 'POST', `/api/training/courses/${courseId}/versions`, {})
    const steps = await rows<any>(`SELECT v.number, s.times_required, s.source_id, s.source_params FROM training_course_steps s
      JOIN training_course_versions v ON v.id = s.version_id WHERE v.course_id = ? ORDER BY v.number`, courseId)
    expect(steps).toEqual([1, 2].map(number => ({ number, times_required: 2, source_id: 'stint.shift', source_params: '{"role":"Duty manager"}' })))
  })
})

describe('signing off from a step source (H2, H3)', () => {
  it('activity.count: two confirmed occurrences meet the step; unconfirmed, self-confirmed and other roles do not count', async () => {
    const manager = await someone(MANAGER)
    const lead = await someone([], 'Lee Lead')
    const { courseId } = await liveCourse(manager, [SHADOWED])
    const person = await learner()
    worked(person, '2026-11-18', null)
    worked(person, '2026-11-19', person.accountId!)
    worked(person, '2026-11-20', lead.accountId!, 'Bar')
    const first = worked(person, '2026-11-21', lead.accountId!)

    const once = await req(person, 'POST', `/api/training/courses/${courseId}/activity`, {})
    expect(once.status, JSON.stringify(once.body)).toBe(200)
    expect(once.body.signOffIds).toHaveLength(1)
    expect(once.body.recordIds).toEqual([])
    expect((await req(person, 'GET', `/api/training/courses/${courseId}/progress`)).body.steps[0]).toMatchObject({ needed: 2, done: 1, met: false })

    const second = worked(person, '2026-11-23', lead.accountId!)
    const twice = await req(person, 'POST', `/api/training/courses/${courseId}/activity`, {})
    expect(twice.body.recordIds).toHaveLength(1)
    expect(await activitySignOffs(person, courseId)).toEqual([
      { source_ref: first, occurred_on: '2026-11-21', confirmed_by: lead.accountId },
      { source_ref: second, occurred_on: '2026-11-23', confirmed_by: lead.accountId },
    ])
  })

  it('activity-once: one occurrence read by its event, by the sweep and on opening the course writes one sign-off', async () => {
    const manager = await someone(MANAGER)
    const lead = await someone([], 'Lee Lead')
    const { courseId } = await liveCourse(manager, [SHADOWED])
    const person = await learner()
    const shift = worked(person, '2026-11-22', lead.accountId!)

    await announce(person, shift)
    await runSweep()
    await req(person, 'POST', `/api/training/courses/${courseId}/activity`, {})
    await announce(person, shift)
    expect(await activitySignOffs(person, courseId)).toEqual([{ source_ref: shift, occurred_on: '2026-11-22', confirmed_by: lead.accountId }])
  })

  it('counts an occurrence once per course, even when two steps on the course read the same source', async () => {
    const manager = await someone(MANAGER)
    const lead = await someone([], 'Lee Lead')
    const { courseId } = await liveCourse(manager, [{ ...SHADOWED, timesRequired: 1 }, { ...SHADOWED, title: 'And another', timesRequired: 1 }])
    const person = await learner()
    worked(person, '2026-11-22', lead.accountId!)
    const read = await req(person, 'POST', `/api/training/courses/${courseId}/activity`, {})
    expect(read.body.signOffIds).toHaveLength(1)
    expect(read.body.recordIds).toEqual([])
  })

  it('the sweep reads people with progress on a course with an activity step', async () => {
    const manager = await someone(MANAGER)
    const lead = await someone([], 'Lee Lead')
    const { courseId } = await liveCourse(manager, [{ kind: 'practical', title: 'Show us' }, SHADOWED])
    const person = await learner()
    const [practical] = await rows<{ id: string }>('SELECT id FROM training_course_steps WHERE kind = \'practical\' AND version_id = (SELECT live_version_id FROM training_courses WHERE id = ?)', courseId)
    const signed = await req(manager, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: person.accountId, stepId: practical!.id, occurredOn: '2026-11-20' })
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)
    worked(person, '2026-11-21', lead.accountId!)
    worked(person, '2026-11-22', lead.accountId!)
    await runSweep()
    expect(await activitySignOffs(person, courseId)).toHaveLength(2)
    expect(await rows('SELECT status FROM training_records WHERE account_id = ? AND course_id = ?', person.accountId, courseId)).toEqual([{ status: 'awarded' }])
  })
})

describe('a source switched off (H4)', () => {
  it('activity-source-off: reports nothing new, and sign-offs already written still count', async () => {
    const manager = await someone(MANAGER)
    const lead = await someone([], 'Lee Lead')
    const { courseId } = await liveCourse(manager, [SHADOWED])
    const person = await learner()
    worked(person, '2026-11-21', lead.accountId!)
    await req(person, 'POST', `/api/training/courses/${courseId}/activity`, {})

    await setModule('stint', false)
    worked(person, '2026-11-22', lead.accountId!)
    const read = await req(person, 'POST', `/api/training/courses/${courseId}/activity`, {})
    expect(read.body.signOffIds).toEqual([])
    expect((await req(person, 'GET', `/api/training/courses/${courseId}/progress`)).body.steps[0]).toMatchObject({ done: 1, met: false })
  })
})
