// Reading a figure (core.measure, Reports spec M1 to M11): core checks the question and the reader
// before the module is asked, holds the read to its budget and lets only keys and numbers through.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '#kit/ids'
import { isRefusal } from '#kit/refusal'
import { listMeasures, readMeasure } from '../../layers/core/server/measures/service'
import { sold } from '../fixtures/modules/seats/server/contributions/core.measure/sold'
import { capacity } from '../fixtures/modules/seats/server/contributions/core.measure/capacity'
import { takings } from '../fixtures/modules/seats/server/contributions/core.measure/takings'
import { env, inContext, person, setModule } from './helpers'

const period = { from: '2026-11-01', to: '2026-11-30' }
const refusal = async (p: Promise<unknown>) => {
  try {
    await p
  }
  catch (error) {
    if (isRefusal(error)) return error.code
    throw error
  }
  return null
}

beforeEach(() => {
  Object.assign(sold, { answer: 'rows', rows: [], asked: [] })
  capacity.rows = []
  takings.rows = []
})
afterEach(async () => {
  await setModule('seats', true)
  await env.DB.prepare("DELETE FROM core_settings WHERE key = 'core.measures.read-budget'").run()
})

describe('readMeasure', () => {
  it('answers the module\'s rows for the asked breakdowns, as keys and numbers', async () => {
    sold.rows = [{ keys: { day: '2026-11-24' }, value: 40 }, { keys: { day: '2026-11-25' }, value: 12 }]
    const answer = await inContext(() => readMeasure('seats.sold', { ...period, by: ['day'] }))
    expect(answer).toEqual({ state: 'ok', rows: sold.rows })
    expect(sold.asked[0]).toMatchObject({ ...period, by: ['day'] })
  })
  it('refuses an unknown figure, a breakdown it does not declare, and more than two breakdowns, before asking the module', async () => {
    expect(await refusal(inContext(() => readMeasure('seats.nothing', { ...period, by: [] })))).toBe('core.measure.unknown')
    expect(await refusal(inContext(() => readMeasure('seats.sold', { ...period, by: ['venue'] })))).toBe('core.measure.unknown-breakdown')
    expect(await refusal(inContext(() => readMeasure('seats.sold', { ...period, by: ['day', 'performance', 'seats.band'] })))).toBe('core.measure.too-many-breakdowns')
    expect(sold.asked).toHaveLength(0)
  })
  it('refuses a filter the figure does not declare, and one with no values or more than twenty (M11)', async () => {
    expect(await refusal(inContext(() => readMeasure('seats.sold', { ...period, by: [], filter: { key: 'performance', values: ['perf_1'] } })))).toBe('core.measure.filter-not-declared')
    expect(await refusal(inContext(() => readMeasure('seats.sold', { ...period, by: [], filter: { key: 'seats.band', values: [] } })))).toBe('core.measure.filter-values')
    const many = Array.from({ length: 21 }, (_, i) => `band-${i}`)
    expect(await refusal(inContext(() => readMeasure('seats.sold', { ...period, by: [], filter: { key: 'seats.band', values: many } })))).toBe('core.measure.filter-values')
    expect(await inContext(() => readMeasure('seats.sold', { ...period, by: [], filter: { key: 'seats.band', values: many.slice(1) } }))).toMatchObject({ state: 'ok' })
  })
  it('refuses a period that runs backwards', async () => {
    expect(await refusal(inContext(() => readMeasure('seats.sold', { from: '2026-11-30', to: '2026-11-01', by: [] })))).toBe('core.measure.period')
  })
  it('refuses a reader without the figure\'s ability (M3)', async () => {
    const nobody = person([])
    expect(await refusal(inContext(() => readMeasure('seats.sold', { ...period, by: [] }, nobody), nobody))).toBe('core.access.denied')
    expect(sold.asked).toHaveLength(0)
  })
  it('lets a grant on a production read that production\'s figures, and not another\'s', async () => {
    const production = newId('prd')
    const reader = person([], { grants: [{ ability: 'seats.figures.view', record: { type: 'core.production', id: production }, via: 'grant:one-production' }] })
    expect(await inContext(() => readMeasure('seats.sold', { ...period, by: [], scope: { production } }, reader), reader)).toMatchObject({ state: 'ok' })
    expect(await refusal(inContext(() => readMeasure('seats.sold', { ...period, by: [], scope: { production: newId('prd') } }, reader), reader))).toBe('core.access.denied')
    expect(await refusal(inContext(() => readMeasure('seats.sold', { ...period, by: [] }, reader), reader))).toBe('core.access.denied')
  })
  it('answers unavailable, never nought, when the module is off (M4)', async () => {
    await setModule('seats', false)
    expect(await inContext(() => readMeasure('seats.sold', { ...period, by: [] }))).toEqual({ state: 'unavailable', reason: 'module-off' })
  })
  it('answers unavailable when the read throws, and unsupported when the module says so', async () => {
    sold.answer = 'throw'
    expect(await inContext(() => readMeasure('seats.sold', { ...period, by: [] }))).toEqual({ state: 'unavailable', reason: 'failed' })
    sold.answer = 'unsupported'
    expect(await inContext(() => readMeasure('seats.sold', { ...period, by: [] }))).toEqual({ state: 'unsupported' })
  })
  it('answers unavailable when the read outlasts core.measures.read-budget', async () => {
    await env.DB.prepare("INSERT INTO core_settings (key, value, updated_at) VALUES ('core.measures.read-budget', '2', 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run()
    sold.answer = 'stall'
    const started = Date.now()
    expect(await inContext(() => readMeasure('seats.sold', { ...period, by: [] }))).toEqual({ state: 'unavailable', reason: 'too-slow' })
    expect(Date.now() - started).toBeLessThan(5000)
  }, 10000)
  it('answers unavailable for an answer carrying a person, an unasked key or a stray field (M2)', async () => {
    for (const rows of [[{ keys: { performance: 'acc_01' }, value: 1 }], [{ keys: { venue: 'ven_1' }, value: 1 }], [{ keys: {}, value: 1, email: 'a@example.com' }]]) {
      sold.answer = { rows }
      expect(await inContext(() => readMeasure('seats.sold', { ...period, by: ['performance'] }))).toEqual({ state: 'unavailable', reason: 'bad-answer' })
    }
  })
  it('lets money through only with its currency', async () => {
    takings.rows = [{ keys: { performance: 'perf_1' }, value: 12500, currency: 'GBP' }]
    expect(await inContext(() => readMeasure('seats.takings', { ...period, by: ['performance'] }))).toEqual({ state: 'ok', rows: takings.rows })
    takings.rows = [{ keys: { performance: 'perf_1' }, value: 12500 }]
    expect(await inContext(() => readMeasure('seats.takings', { ...period, by: ['performance'] }))).toEqual({ state: 'unavailable', reason: 'bad-answer' })
  })
  it('works a ratio out group by group, leaving out a group with nothing under it', async () => {
    sold.rows = [{ keys: { day: '2026-11-24' }, value: 30 }, { keys: { day: '2026-11-25' }, value: 5 }, { keys: { day: '2026-11-26' }, value: 0 }]
    capacity.rows = [{ keys: { day: '2026-11-24' }, value: 40 }, { keys: { day: '2026-11-25' }, value: 0 }, { keys: { day: '2026-11-26' }, value: 40 }]
    expect(await inContext(() => readMeasure('seats.fill', { ...period, by: ['day'] }))).toEqual({ state: 'ok', rows: [{ keys: { day: '2026-11-24' }, value: 75 }, { keys: { day: '2026-11-26' }, value: 0 }] })
  })
  it('answers a ratio unavailable when either part is', async () => {
    sold.answer = 'throw'
    expect(await inContext(() => readMeasure('seats.fill', { ...period, by: [] }))).toEqual({ state: 'unavailable', reason: 'failed' })
  })
})

describe('listMeasures', () => {
  it('lists every figure to the system, and only those the reader may read somewhere to a person', async () => {
    const all = await inContext(() => listMeasures())
    expect(all.map(m => m.id)).toEqual(expect.arrayContaining(['seats.capacity', 'seats.fill', 'seats.sold', 'seats.takings']))
    expect(all.find(m => m.id === 'seats.fill')).toMatchObject({ unit: 'percent', ratio: true, by: ['performance', 'day'] })
    const nobody = person([])
    expect((await inContext(() => listMeasures(nobody), nobody)).some(m => m.module === 'seats')).toBe(false)
    const one = person([], { grants: [{ ability: 'seats.figures.view', record: { type: 'core.production', id: newId('prd') }, via: 'grant:one' }] })
    expect((await inContext(() => listMeasures(one), one)).filter(m => m.module === 'seats')).toHaveLength(4)
  })
})
