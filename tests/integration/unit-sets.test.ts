// U7 to U9: a fan-out is written set-wise, one statement per table whatever the row count, and a
// set larger than core.units.set-rows-limit (at most 2,000) or over 1 MB is refused before anything
// is written.
import { afterEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, isId } from '#kit'
import { setDispatcher, type JobMessage } from '#kit/dispatch'
import { runInContext, SYSTEM } from '#kit/context'
import { ledger, performances } from '../fixtures/modules/seats/server/db/schema'
import { deliver, env, inContext, rows, sent } from './helpers'

async function setLimit(key: string, value: number | null) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, value === null ? { reset: true, reason: 'test' } : { reason: 'test' })
    await unit.commit()
  })
}

afterEach(async () => {
  await setLimit('core.units.statement-limit', null)
  await setLimit('core.units.set-rows-limit', null)
  sent.length = 0
})

describe('a set written in a unit of work', () => {
  it('inserts every row in one statement and returns the ids it made, in order', async () => {
    const titles = Array.from({ length: 120 }, (_, i) => `Show ${i}`)
    const { ids, result } = await inContext(async () => {
      const unit = createUnit()
      const ids = unit.insertSet(performances, titles.map((title, i) => ({ title, capacity: i + 1, startsAt: i % 2 ? Date.UTC(2026, 10, 21, 19, 30) : null })))
      unit.expect(120)
      return { ids, result: await unit.commit() }
    })
    expect(result.results).toHaveLength(1)
    expect(ids).toHaveLength(120)
    expect(ids.every(id => isId('sp', id))).toBe(true)
    const written = await rows<{ id: string, title: string, capacity: number, sold: number, starts_at: number | null }>(
      'SELECT id, title, capacity, sold, starts_at FROM seats_performances WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
    const byId = new Map(written.map(r => [r.id, r]))
    expect(ids.map(id => byId.get(id)?.title)).toEqual(titles)
    expect(byId.get(ids[3]!)).toMatchObject({ capacity: 4, sold: 0, starts_at: Date.UTC(2026, 10, 21, 19, 30) })
    expect(byId.get(ids[4]!)?.starts_at).toBeNull()
  })

  it('makes each row\'s defaults, such as the time it was made, before the unit is built', async () => {
    const performanceId = await inContext(async () => {
      const unit = createUnit()
      const [id] = unit.insertSet(performances, [{ title: 'Hamlet', capacity: 10 }])
      await unit.commit()
      return id!
    })
    const ids = await inContext(async () => {
      const unit = createUnit()
      const ids = unit.insertSet(ledger, [1, 2, 3].map(quantity => ({ performanceId, quantity, buyer: `acc_${quantity}`, buyerName: null, note: null })))
      await unit.commit()
      return ids
    })
    const written = await rows<{ quantity: number, at: number }>('SELECT quantity, created_at AS at FROM seats_ledger WHERE performance_id = ? ORDER BY quantity', performanceId)
    expect(written.map(r => r.quantity)).toEqual([1, 2, 3])
    expect(written.every(r => typeof r.at === 'number' && r.at > 0)).toBe(true)
    expect(ids.every(id => isId('sl', id))).toBe(true)
  })

  it('writes nothing when the guard after a set finds a different number of rows', async () => {
    const result = inContext(async () => {
      const unit = createUnit()
      unit.insertSet(performances, [{ title: 'Guarded A', capacity: 1 }, { title: 'Guarded B', capacity: 1 }])
      unit.expect(3, { code: 'seats.count', reason: 'Not every row was written.' })
      return unit.commit()
    })
    await expect(result).rejects.toMatchObject({ code: 'seats.count' })
    expect(await rows("SELECT id FROM seats_performances WHERE title LIKE 'Guarded %'")).toHaveLength(0)
  })

  it('refuses rows that do not all give the same columns', async () => {
    await expect(inContext(async () => {
      createUnit().insertSet(performances, [{ title: 'One', capacity: 1 }, { title: 'Two' }])
    })).rejects.toThrow(/same columns/)
    await expect(inContext(async () => {
      createUnit().insertSet(performances, [{ title: 'One', capacity: 1, colour: 'red' }])
    })).rejects.toThrow(/no column "colour"/)
  })

  it('refuses a set larger than core.units.set-rows-limit before running anything', async () => {
    await setLimit('core.units.set-rows-limit', 10)
    const result = inContext(async () => {
      const unit = createUnit()
      unit.insertSet(performances, Array.from({ length: 11 }, (_, i) => ({ title: `Too many ${i}`, capacity: 1 })))
      return unit.commit()
    })
    await expect(result).rejects.toMatchObject({ code: 'core.unit.too-large' })
    expect(await rows("SELECT id FROM seats_performances WHERE title LIKE 'Too many %'")).toHaveLength(0)
  })

  it('refuses a set whose JSON parameter is over 1 MB, however few its rows', async () => {
    // Ten rows of 120,000 characters: within any row limit, over the kit's byte limit (U9).
    const wide = 'x'.repeat(120_000) // not-policy: a title wide enough to pass 1 MB in ten rows
    const result = inContext(async () => {
      const unit = createUnit()
      unit.insertSet(performances, Array.from({ length: 10 }, (_, i) => ({ title: `Too wide ${i} ${wide}`, capacity: 1 })))
      return unit.commit()
    })
    await expect(result).rejects.toMatchObject({ code: 'core.unit.too-large', reason: expect.stringMatching(/more than the limit of 1,000 KB/) })
    expect(await rows("SELECT id FROM seats_performances WHERE title LIKE 'Too wide %'")).toHaveLength(0)
  })

  it('refuses a set-rows limit above 2,000', async () => {
    await expect(setLimit('core.units.set-rows-limit', 2001)).rejects.toThrow(/must be at most 2,?000/)
    await setLimit('core.units.set-rows-limit', 2000)
  })

  it('announces and audits a set in one statement each, plus one per listener, with each event delivered as its own', async () => {
    // Three hundred rows in one unit under a limit of ten statements: the cost does not grow with the set.
    await setLimit('core.units.statement-limit', 10)
    await deliver()
    const count = 100
    const ids = await inContext(async () => {
      const unit = createUnit()
      const ids = unit.insertSet(performances, Array.from({ length: count }, (_, i) => ({ title: `Run ${i}`, capacity: 5 })))
      unit.announce('seats.performance.sold', ids.map(performanceId => ({ payload: { performanceId, quantity: 1 }, record: ['seats.performance', performanceId] as const })))
      unit.audit(ids.map(id => ({ action: 'create' as const, ability: 'seats.orders.sell', record: ['seats.performance', id] as const, detail: { seats: 1 } })))
      const result = await unit.commit()
      expect(result.eventIds).toHaveLength(count)
      expect(result.jobIds).toHaveLength(count)
      return ids
    })
    const list = JSON.stringify(ids)
    const events = await rows<{ record_id: string, payload: string }>('SELECT record_id, payload FROM core_events WHERE record_id IN (SELECT value FROM json_each(?))', list)
    expect(events).toHaveLength(count)
    expect(JSON.parse(events[0]!.payload)).toMatchObject({ quantity: 1 })
    const audit = await rows<{ action: string, ability: string, module_id: string, detail: string }>('SELECT action, ability, module_id, detail FROM core_audit WHERE record_id IN (SELECT value FROM json_each(?))', list)
    expect(audit).toHaveLength(count)
    expect(audit[0]).toMatchObject({ action: 'create', ability: 'seats.orders.sell', module_id: 'seats', detail: '{"seats":1}' })
    expect(await rows("SELECT id FROM core_jobs WHERE kind = 'listener' AND dedupe_key IN (SELECT id FROM core_events WHERE record_id IN (SELECT value FROM json_each(?)))", list)).toHaveLength(count)

    expect(sent).toHaveLength(count)
    await deliver()
    expect(await rows('SELECT id FROM notify_notes WHERE performance_id IN (SELECT value FROM json_each(?))', list)).toHaveLength(count)
  })

  it('still takes one event or one audit entry as before', async () => {
    const [id] = await inContext(async () => {
      const unit = createUnit()
      const ids = unit.insertSet(performances, [{ title: 'Single', capacity: 1 }])
      const eventId = unit.announce('seats.performance.sold', { performanceId: ids[0]!, quantity: 2 }, { record: ['seats.performance', ids[0]!] })
      expect(typeof eventId).toBe('string')
      unit.audit({ action: 'create', record: ['seats.performance', ids[0]!] })
      await unit.commit()
      return ids
    })
    expect(await rows('SELECT id FROM core_events WHERE record_id = ?', id)).toHaveLength(1)
    expect(await rows('SELECT id FROM core_audit WHERE record_id = ?', id)).toHaveLength(1)
  })
})

describe('sending job messages', () => {
  it('sends at most a hundred messages to a queue at a time', async () => {
    const calls: number[] = []
    const queue = { sendBatch: async (messages: unknown[]) => void calls.push(messages.length) } as unknown as Queue
    setDispatcher(undefined)
    try {
      const { dispatch } = await import('#kit/dispatch')
      const messages: JobMessage[] = Array.from({ length: 250 }, (_, i) => ({ jobId: `job_${i}`, lane: 'prompt' }))
      await runInContext({ env: { ...env, JOBS_PROMPT: queue }, actor: SYSTEM, cache: {} }, () => dispatch(messages))
    }
    finally {
      setDispatcher(async (messages) => {
        sent.push(...messages)
      })
    }
    expect(calls).toEqual([100, 100, 50])
  })
})

describe('retention', () => {
  it('reads a fixed retention as it reads a setting\'s', async () => {
    const { retentionSeconds } = await import('#kit')
    const { ticks, ledger } = await import('../fixtures/modules/seats/server/db/schema')
    expect(await inContext(() => retentionSeconds(ticks))).toBe(30 * 86_400)
    expect(await inContext(() => retentionSeconds(ledger))).toBeNull()
  })
})
