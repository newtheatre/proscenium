// Telling people their training is running out (L3, V6): the daily sweep's warnings and lapses, and
// the job that tells holders a version cut their training short.
import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, createUnit } from '#kit'
import { deliver, inContext, rows } from '../../../../tests/integration/helpers'
import sweep from '../../server/tasks/sweep-records'
import { DAY, MANAGER, NOV_24, liveCourse, ready, req, someone } from './stage'

beforeEach(ready)

async function runSweep(): Promise<void> {
  await inContext(async () => sweep(createUnit().view(), { dueAt: NOV_24 }))
}

const notices = (type: string, accountId: string) => rows('SELECT 1 FROM core_notifications WHERE type_key = ? AND account_id = ?', type, accountId)
const events = (name: string, recordId: string) => rows('SELECT 1 FROM core_events WHERE name = ? AND record_id = ?', name, recordId)

/** A person awarded a course valid for 60 days, with the record's id. */
async function awarded(): Promise<{ courseId: string, accountId: string, recordId: string }> {
  const manager = await someone(MANAGER)
  const { courseId, stepIds } = await liveCourse(manager, undefined, { validFor: 60 * 86_400 })
  const person = await someone(['training.course.view'])
  const signed = await req(manager, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: person.accountId, stepId: stepIds[0], occurredOn: '2026-11-24' })
  expect(signed.body.recordId).toMatch(/^trec_/)
  return { courseId, accountId: person.accountId!, recordId: signed.body.recordId }
}

describe('the daily sweep (L3)', () => {
  it('sweep-idempotent: warns once inside the warning period and announces the lapse once after the date', async () => {
    const { accountId, recordId } = await awarded()
    await runSweep()
    expect(await notices('training.record-expiring', accountId)).toHaveLength(0)

    // Thirty days' warning by default: 40 days on, 20 remain.
    advanceClock(40 * DAY)
    await runSweep()
    await runSweep()
    expect(await notices('training.record-expiring', accountId)).toHaveLength(1)
    expect(await events('training.record.expiring', recordId)).toHaveLength(1)
    expect(await events('training.record.lapsed', recordId)).toHaveLength(0)

    advanceClock(25 * DAY)
    await runSweep()
    await runSweep()
    expect(await notices('training.record-lapsed', accountId)).toHaveLength(1)
    expect(await events('training.record.lapsed', recordId)).toHaveLength(1)
    // Lapsed is read from the date; the row stays awarded.
    expect(await rows('SELECT status FROM training_records WHERE id = ?', recordId)).toEqual([{ status: 'awarded' }])
  })
})

describe('cut short by a new version (V6)', () => {
  it('tells each holder once, from a job, and announces each record cut short', async () => {
    const manager = await someone(MANAGER)
    const { courseId, stepIds } = await liveCourse(manager, undefined, { validFor: 365 * 86_400 })
    const people = [await someone(['training.course.view']), await someone(['training.course.view'])]
    for (const p of people) await req(manager, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: p.accountId, stepId: stepIds[0], occurredOn: '2026-11-24' })
    await req(manager, 'POST', `/api/training/courses/${courseId}/versions`, {})
    const published = await req(manager, 'POST', `/api/training/courses/${courseId}/publish`, { changeKind: 'retraining-required', changeNote: 'New fire doors' })
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    await deliver()
    for (const p of people) {
      const [notice] = await rows<{ payload: string }>('SELECT payload FROM core_notifications WHERE type_key = \'training.record-cut-short\' AND account_id = ?', p.accountId)
      expect(notice).toBeDefined()
    }
    expect(await rows('SELECT 1 FROM core_events WHERE name = \'training.record.cut-short\' AND record_id IN (SELECT id FROM training_records WHERE course_id = ?)', courseId)).toHaveLength(2)
  })
})
