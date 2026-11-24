// Sign-offs and the training records they earn (TR-05 to TR-08, TR-17 to TR-20; S1 to S5, A1 to A6, L1 to L4).
import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, setClock } from '#kit'
import { rows } from '../../../../tests/integration/helpers'
import { DAY, liveCourse, MANAGER, NOV_24, ready, req, someone, today } from './stage'

beforeEach(ready)

/** The last millisecond of a London day in winter, when London is on UTC. */
const endOf = (day: string) => Date.parse(`${day}T23:59:59.999Z`)

describe('signing off a practical step (TR-05)', () => {
  it('counts towards a step needing two, refuses oneself and a future day', async () => {
    const trainer = await someone(MANAGER, 'Tess Trainer')
    const learner = await someone(['training.course.view'])
    const { courseId, stepIds } = await liveCourse(trainer, [{ kind: 'practical', title: 'Two supervised shifts', timesRequired: 2 }])

    const own = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: trainer.accountId, stepId: stepIds[0], occurredOn: today })
    expect(own.status).toBe(403)
    expect(own.body.code).toBe('training.own-sign-off')
    const future = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: '2026-11-25' })
    expect(future.body.code).toBe('training.sign-off.future')

    const first = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: '2026-11-20' })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.recordId).toBeNull()
    const progress = await req(learner, 'GET', `/api/training/courses/${courseId}/progress`)
    expect(progress.body.steps).toEqual([expect.objectContaining({ needed: 2, done: 1, met: false })])
  })

  it('needs sign-off.record at the course', async () => {
    const manager = await someone(MANAGER)
    const stranger = await someone(['training.course.view'])
    const learner = await someone()
    const { courseId, stepIds } = await liveCourse(manager)
    expect((await req(stranger, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })).status).toBe(403)
  })
})

describe('the award (TR-06; A1 to A5)', () => {
  it('writes the training record, its event, audit and notification with the last sign-off', async () => {
    const trainer = await someone(MANAGER)
    const learner = await someone(['training.course.view'])
    const { courseId, stepIds } = await liveCourse(trainer, [{ kind: 'practical', title: 'One' }, { kind: 'practical', title: 'Two' }])
    await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })
    const last = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[1], occurredOn: today })
    expect(last.body.recordId).toMatch(/^trec_/)

    const [record] = await rows<any>('SELECT * FROM training_records WHERE id = ?', last.body.recordId)
    // Valid for 365 days from today, to the end of that day in London.
    expect(record).toMatchObject({ account_id: learner.accountId, origin: 'steps', status: 'awarded', expires_at: endOf('2027-11-24') })
    expect(JSON.parse(record.sign_off_ids)).toHaveLength(2)
    expect(await rows('SELECT 1 FROM core_events WHERE name = \'training.record.awarded\' AND record_id = ?', last.body.recordId)).toHaveLength(1)
    expect(await rows('SELECT 1 FROM core_audit WHERE record_type = \'training.record\' AND record_id = ?', last.body.recordId)).toHaveLength(1)
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'training.record-awarded\' AND account_id = ?', learner.accountId)).toHaveLength(1)

    const mine = await req(learner, 'GET', '/api/training/me/records')
    expect(mine.body.records).toEqual([expect.objectContaining({ id: last.body.recordId, standing: 'current' })])
  })

  it('gives a course that never lapses a record with no expiry', async () => {
    const trainer = await someone(MANAGER)
    const learner = await someone()
    const { courseId, stepIds } = await liveCourse(trainer, undefined, { expires: false, validFor: null })
    const done = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })
    const [record] = await rows<any>('SELECT expires_at FROM training_records WHERE id = ?', done.body.recordId)
    expect(record.expires_at).toBeNull()
  })

  it('stops counting a sign-off once it is older than the progress window (S3)', async () => {
    const trainer = await someone(MANAGER)
    const learner = await someone()
    const { courseId, stepIds } = await liveCourse(trainer, [{ kind: 'practical', title: 'One' }, { kind: 'practical', title: 'Two' }])
    await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: '2026-05-01' })
    const later = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[1], occurredOn: today })
    expect(later.body.recordId).toBeNull()
  })

  it('runs an early renewal from the old expiry, and needs only the renewal steps (TR-17; A2, A3)', async () => {
    const trainer = await someone(MANAGER)
    const learner = await someone()
    const { courseId, stepIds } = await liveCourse(trainer, [
      { kind: 'practical', title: 'First time only', neededFor: 'first' },
      { kind: 'practical', title: 'Every time', neededFor: 'both' },
    ])
    await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })
    const first = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[1], occurredOn: today })
    expect(first.body.recordId).toMatch(/^trec_/)

    // 340 days on, inside the 60-day renewal window: the renewal step alone renews.
    setClock(NOV_24 + 340 * DAY)
    const renewed = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[1], occurredOn: '2027-10-30' })
    expect(renewed.body.recordId).toMatch(/^trec_/)
    const [now] = await rows<any>('SELECT expires_at FROM training_records WHERE id = ?', renewed.body.recordId)
    expect(now.expires_at).toBe(endOf('2028-11-23'))
    const [old] = await rows<any>('SELECT status, superseded_by FROM training_records WHERE id = ?', first.body.recordId)
    expect(old).toEqual({ status: 'superseded', superseded_by: renewed.body.recordId })
  })

  it('needs the whole course again once the renewal grace has passed', async () => {
    const trainer = await someone(MANAGER)
    const learner = await someone()
    const { courseId, stepIds } = await liveCourse(trainer, [
      { kind: 'practical', title: 'First time only', neededFor: 'first' },
      { kind: 'practical', title: 'Every time', neededFor: 'both' },
    ])
    await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })
    await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[1], occurredOn: today })
    // A year and 31 days on: lapsed beyond the 30-day grace.
    setClock(NOV_24 + 396 * DAY)
    const again = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[1], occurredOn: '2027-12-25' })
    expect(again.body.recordId).toBeNull()
    expect((await req(learner, 'GET', '/api/training/me/records')).body.records[0].standing).toBe('lapsed')
  })
})

describe('a new version (TR-18; V5, V6)', () => {
  it('leaves records alone when they stand, and cuts every holder short when retraining is required', async () => {
    const trainer = await someone(MANAGER)
    const learner = await someone()
    const { courseId, stepIds } = await liveCourse(trainer, [{ kind: 'practical', title: 'Unchanged' }, { kind: 'practical', title: 'Will change' }])
    await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })
    const held = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[1], occurredOn: today })

    await req(trainer, 'POST', `/api/training/courses/${courseId}/versions`)
    await req(trainer, 'POST', `/api/training/courses/${courseId}/publish`, { changeKind: 'records-stand' })
    const [stood] = await rows<any>('SELECT expires_at, cut_reason FROM training_records WHERE id = ?', held.body.recordId)
    expect(stood).toEqual({ expires_at: endOf('2027-11-24'), cut_reason: null })

    await req(trainer, 'POST', `/api/training/courses/${courseId}/versions`)
    const draft = (await req(trainer, 'GET', `/api/training/courses/${courseId}`)).body.preparing.steps
    await req(trainer, 'PUT', `/api/training/courses/${courseId}/steps`, { steps: [
      { id: draft[0].id, kind: 'practical', title: 'Unchanged' },
      { id: draft[1].id, kind: 'practical', title: 'Will change', changed: true },
    ] })
    const published = await req(trainer, 'POST', `/api/training/courses/${courseId}/publish`, { changeKind: 'retraining-required', changeNote: 'New extinguishers' })
    // 28 days' grace, to the end of 22 December.
    expect(published.body.cutTo).toBe(endOf('2026-12-22'))
    const [cut] = await rows<any>('SELECT expires_at, natural_expires_at, cut_reason FROM training_records WHERE id = ?', held.body.recordId)
    expect(cut).toEqual({ expires_at: endOf('2026-12-22'), natural_expires_at: endOf('2027-11-24'), cut_reason: 'material-changed' })

    // Retraining needs only the changed step.
    advanceClock(DAY)
    const steps = (await req(trainer, 'GET', `/api/training/courses/${courseId}`)).body.live
    const retrained = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: steps[1].id, occurredOn: '2026-11-25' })
    expect(retrained.body.recordId).toMatch(/^trec_/)
  })
})

describe('reading steps (TR-08)', () => {
  it('confirms only once the material was opened', async () => {
    const manager = await someone(MANAGER)
    const learner = await someone(['training.course.view'])
    const { courseId, stepIds } = await liveCourse(manager, [{ kind: 'reading', title: 'Read the policy', materialUrl: 'https://example.org/policy' }])
    const early = await req(learner, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[0]}/read`)
    expect(early.body.code).toBe('training.reading.not-opened')
    expect((await req(learner, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[0]}/opened`)).status).toBe(200)
    const read = await req(learner, 'POST', `/api/training/courses/${courseId}/steps/${stepIds[0]}/read`)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body.recordId).toMatch(/^trec_/)
  })
})

describe('voiding and revoking (TR-19)', () => {
  it('voids a sign-off with a second row, once, and leaves an award standing', async () => {
    const trainer = await someone(MANAGER)
    const other = await someone(['training.course.view', 'training.sign-off.record'])
    const learner = await someone(['training.course.view'])
    const { courseId, stepIds } = await liveCourse(trainer)
    const signed = await req(trainer, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })
    expect((await req(other, 'POST', `/api/training/sign-offs/${signed.body.signOffId}/void`, { note: 'Wrong person' })).body.code).toBe('training.sign-off.not-yours')
    expect((await req(trainer, 'POST', `/api/training/sign-offs/${signed.body.signOffId}/void`, { note: 'Wrong person' })).status).toBe(200)
    expect((await req(trainer, 'POST', `/api/training/sign-offs/${signed.body.signOffId}/void`, { note: 'Again' })).body.code).toBe('training.sign-off.voided')
    const [record] = await rows<any>('SELECT status FROM training_records WHERE id = ?', signed.body.recordId)
    expect(record.status).toBe('awarded')
    expect((await req(learner, 'GET', `/api/training/courses/${courseId}/progress`)).body.steps[0].met).toBe(false)
  })

  it('revokes with a code and a note; the next award needs the whole course', async () => {
    const admin = await someone(MANAGER)
    const learner = await someone()
    const { courseId, stepIds } = await liveCourse(admin)
    const signed = await req(admin, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })
    const revoked = await req(admin, 'POST', `/api/training/records/${signed.body.recordId}/revoke`, { code: 'no-longer-competent', note: 'Failed a spot check' })
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200)
    expect((await req(admin, 'POST', `/api/training/records/${signed.body.recordId}/revoke`, { code: 'other', note: 'Again' })).body.code).toBe('training.record.not-current')
    expect(await rows('SELECT 1 FROM core_notifications WHERE type_key = \'training.record-revoked\' AND account_id = ?', learner.accountId)).toHaveLength(1)
    expect((await req(learner, 'GET', '/api/training/me/records')).body.records[0].standing).toBe('revoked')
  })
})

describe('a direct award (TR-20; A6)', () => {
  it('needs a reason and an expiry within the course\'s validity, and is never to oneself', async () => {
    const admin = await someone(MANAGER)
    const learner = await someone()
    const { courseId } = await liveCourse(admin)
    expect((await req(admin, 'POST', `/api/training/courses/${courseId}/awards`, { accountId: admin.accountId, reason: 'Trained before', expiresOn: '2027-06-01' })).body.code).toBe('training.own-award')
    expect((await req(admin, 'POST', `/api/training/courses/${courseId}/awards`, { accountId: learner.accountId, reason: 'Trained before', expiresOn: '2028-06-01' })).body.code).toBe('training.award.expiry-out-of-range')
    const awarded = await req(admin, 'POST', `/api/training/courses/${courseId}/awards`, { accountId: learner.accountId, reason: 'Trained at another theatre', expiresOn: '2027-06-01' })
    expect(awarded.status, JSON.stringify(awarded.body)).toBe(200)
    const [record] = await rows<any>('SELECT origin, direct_reason, expires_at, awarded_by FROM training_records WHERE id = ?', awarded.body.recordId)
    expect(record).toEqual({ origin: 'direct', direct_reason: 'Trained at another theatre', expires_at: Date.parse('2027-06-01T22:59:59.999Z'), awarded_by: admin.accountId })
  })
})

describe('seeing training records (TR-07; L4)', () => {
  it('shows a person their own, and another person\'s only with record.view, audited', async () => {
    const admin = await someone(MANAGER)
    const nosy = await someone(['training.course.view'])
    const learner = await someone()
    const { courseId, stepIds } = await liveCourse(admin)
    await req(admin, 'POST', `/api/training/courses/${courseId}/sign-offs`, { accountId: learner.accountId, stepId: stepIds[0], occurredOn: today })
    expect((await req(nosy, 'GET', `/api/training/people/${learner.accountId}/records`)).status).toBe(403)
    const seen = await req(admin, 'GET', `/api/training/people/${learner.accountId}/records`)
    expect(seen.body.records).toHaveLength(1)
    expect(await rows('SELECT 1 FROM core_audit WHERE action = \'read\' AND record_id = ?', learner.accountId)).not.toHaveLength(0)
  })
})
