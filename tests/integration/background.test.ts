// F-06 events, F-07 jobs and tasks, F-08 external calls.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { changeSetting, createUnit, enqueue, externalCall, newId, setClock } from '#kit'
import { runJob, runScheduler, sweepJobs } from '#kit/jobs'
import { reconcileDue } from '#kit/external'
import { provider } from '../fixtures/modules/seats/server/calls/take-payment'
import { deliver, env, inContext, performance, rows, sent, setModule } from './helpers'

const HOUR = 3_600_000

beforeEach(() => {
  sent.length = 0
  setClock(Date.now())
})
afterEach(async () => {
  setClock(undefined)
  await setModule('seats', true)
  await setModule('notify', true)
})

async function sell(performanceId: string, guardFails = false) {
  return inContext(async () => {
    const unit = createUnit()
    unit.add(sql`UPDATE seats_performances SET sold = sold + 1 WHERE id = ${performanceId}`).expect(guardFails ? 2 : 1)
    const eventId = unit.announce('seats.performance.sold', { performanceId, quantity: 1 })
    await unit.commit()
    return eventId
  })
}

describe('events (F-06)', () => {
  it('reaches a listener in another module, after the announcing unit commits', async () => {
    const id = await performance()
    const eventId = await sell(id)
    expect(await rows('SELECT id FROM notify_notes WHERE event_id = ?', eventId)).toHaveLength(0)
    expect(await deliver()).toEqual(['done'])
    expect(await rows('SELECT performance_id FROM notify_notes WHERE event_id = ?', eventId)).toEqual([{ performance_id: id }])
  })

  it('reaches no listener when the announcing unit fails', async () => {
    const id = await performance()
    await expect(sell(id, true)).rejects.toMatchObject({ code: 'core.unit.conflict' })
    expect(sent).toHaveLength(0)
    expect(await rows("SELECT id FROM core_events WHERE json_extract(payload, '$.performanceId') = ?", id)).toHaveLength(0)
  })

  it('reaches no listener in a switched-off module', async () => {
    await setModule('notify', false)
    const id = await performance()
    const eventId = await sell(id)
    expect(await rows('SELECT id FROM core_events WHERE id = ?', eventId)).toHaveLength(1)
    expect(sent).toHaveLength(0)
    expect(await rows("SELECT id FROM core_jobs WHERE kind = 'listener' AND dedupe_key = ?", eventId)).toHaveLength(0)
  })
})

describe('jobs (F-07)', () => {
  it('runs a job once when its message arrives twice', async () => {
    const id = await inContext(() => enqueue('seats.retry-flaky', { failTimes: 0 }))
    const outcomes = await Promise.all([1, 2].map(() => inContext(() => runJob(id), { kind: 'job' })))
    expect(outcomes.sort()).toEqual(['done', 'skipped'])
    expect(await rows('SELECT state, attempts FROM core_jobs WHERE id = ?', id)).toEqual([{ state: 'done', attempts: 1 }])
  })

  it('retries with back-off, then gives up and says so', async () => {
    const id = await inContext(() => enqueue('seats.retry-flaky', { failTimes: 10 }))
    expect(await inContext(() => runJob(id))).toBe('retrying')
    expect(await inContext(() => runJob(id))).toBe('skipped') // not due yet
    setClock(Date.now() + HOUR)
    expect(await inContext(() => runJob(id))).toBe('retrying')
    setClock(Date.now() + 2 * HOUR)
    expect(await inContext(() => runJob(id))).toBe('dead')
    expect(await rows('SELECT state, attempts FROM core_jobs WHERE id = ?', id)).toEqual([{ state: 'dead', attempts: 3 }])
    expect(await rows("SELECT name FROM core_events WHERE name = 'core.job.died' AND json_extract(payload, '$.jobId') = ?", id)).toHaveLength(1)
  })

  it('succeeds on a later attempt after failing', async () => {
    const id = await inContext(() => enqueue('seats.retry-flaky', { failTimes: 1 }))
    expect(await inContext(() => runJob(id))).toBe('retrying')
    setClock(Date.now() + HOUR)
    expect(await inContext(() => runJob(id))).toBe('done')
  })

  it('leaves a switched-off module\'s jobs waiting until it is on again', async () => {
    const id = await inContext(() => enqueue('seats.retry-flaky', { failTimes: 0 }))
    await setModule('seats', false)
    expect(await inContext(() => runJob(id))).toBe('waiting')
    expect(await rows('SELECT state FROM core_jobs WHERE id = ?', id)).toEqual([{ state: 'queued' }])
    await setModule('seats', true)
    expect(await inContext(() => runJob(id))).toBe('done')
  })

  it('sends a lost message again from the sweep', async () => {
    const id = await inContext(() => enqueue('seats.retry-flaky', { failTimes: 0 }))
    sent.length = 0 // the message is lost
    await inContext(() => sweepJobs(Date.now() + 2 * 60_000))
    expect(sent.map(m => m.jobId)).toContain(id)
  })
})

describe('tasks (F-07)', () => {
  const runsOf = (from: number, to: number) => rows("SELECT due_at FROM core_task_runs WHERE task = 'seats.count-seats' AND due_at BETWEEN ? AND ?", from, to)
  const setZone = (zone: string | null) => inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', zone, { confirm: true, reset: zone === null })
    await unit.commit()
  })
  beforeEach(() => setZone('Europe/London'))
  afterEach(() => setZone(null))

  it('keeps to UTC until setup sets the time zone', async () => {
    await setZone(null)
    const at = Date.parse('2027-07-10T12:00:00Z')
    await inContext(() => runScheduler(at))
    expect(await runsOf(at - 24 * HOUR, at)).toEqual([{ due_at: Date.parse('2027-07-10T02:00:00Z') }])
  })

  it('queues a slot once when the cron fires twice', async () => {
    const at = Date.parse('2027-01-10T12:00:00Z')
    await inContext(() => runScheduler(at))
    await inContext(() => runScheduler(at + 60_000))
    expect(await runsOf(at - 24 * HOUR, at + HOUR)).toEqual([{ due_at: Date.parse('2027-01-10T02:00:00Z') }])
  })

  it('runs only the latest missed slot after a gap', async () => {
    const at = Date.parse('2027-02-20T12:00:00Z')
    await inContext(() => runScheduler(at))
    expect(await runsOf(Date.parse('2027-02-15T00:00:00Z'), at)).toEqual([{ due_at: Date.parse('2027-02-20T02:00:00Z') }])
  })

  it('keeps to the theatre\'s local time across the clocks going forward', async () => {
    const at = Date.parse('2027-03-28T12:00:00Z') // British Summer Time began at 01:00 UTC
    await inContext(() => runScheduler(at))
    expect(await runsOf(Date.parse('2027-03-27T12:00:00Z'), at)).toEqual([{ due_at: Date.parse('2027-03-28T01:00:00Z') }])
  })

  it('runs the task through its job', async () => {
    const at = Date.parse('2027-04-02T12:00:00Z')
    sent.length = 0
    await inContext(() => runScheduler(at))
    setClock(at)
    const outcomes = await deliver()
    expect(outcomes.every(o => o === 'done')).toBe(true)
    expect(await rows("SELECT outcome FROM core_task_runs WHERE task = 'seats.count-seats' AND due_at = ?", Date.parse('2027-04-02T01:00:00Z'))).toEqual([{ outcome: 'done' }])
  })
})

describe('external calls (F-08)', () => {
  async function charge() {
    const id = newId('sc')
    await env.DB.prepare("INSERT INTO seats_charges (id, amount, state) VALUES (?, 1500, 'pending')").bind(id).run()
    return id
  }
  const state = async (id: string) => (await rows<{ state: string }>('SELECT state FROM seats_charges WHERE id = ?', id))[0]!.state

  it('records the attempt before calling and the outcome after', async () => {
    const id = await charge()
    let calls = 0
    const result = await inContext(() => externalCall('seats.take-payment', {
      reference: ['seats.charge', id],
      call: async () => {
        calls++
        expect(await rows('SELECT phase FROM core_external_calls WHERE reference = ?', `seats.charge:${id}`)).toEqual([{ phase: 'attempt' }])
        return { result: 'succeeded', providerReference: 'pi_1' }
      },
    }))
    expect(result.state).toBe('succeeded')
    expect(await state(id)).toBe('paid')
    const again = await inContext(() => externalCall('seats.take-payment', { reference: ['seats.charge', id], call: async () => {
      calls++
      return { result: 'failed' }
    } }))
    expect(again.state).toBe('succeeded')
    expect(calls).toBe(1)
  })

  it('leaves a timed-out call unknown, never done, until reconciliation settles it', async () => {
    const id = await charge()
    const result = await inContext(() => externalCall('seats.take-payment', {
      reference: ['seats.charge', id],
      call: async () => { throw new Error('socket hang up') },
    }))
    expect(result.state).toBe('unknown')
    expect(await state(id)).toBe('pending')

    expect(await inContext(() => reconcileDue(Date.now() + 2 * 60_000))).toBe(0) // the provider does not know yet
    provider.known.set(result.attempt.idempotencyKey, { result: 'succeeded', providerReference: 'pi_2' })
    expect(await inContext(() => reconcileDue(Date.now() + 30_000))).toBe(0) // not old enough
    expect(await inContext(() => reconcileDue(Date.now() + 2 * 60_000))).toBeGreaterThanOrEqual(1)
    expect(await state(id)).toBe('paid')
  })
})
