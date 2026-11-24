// Figures per person (core.person-measure, Reports rules P1 to P8, R3-27): only Reports reads them,
// for someone holding both abilities, and every read leaves one audit row with no names or figures.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext, type Actor } from '#kit/context'
import { newId } from '#kit/ids'
import { isRefusal } from '#kit/refusal'
import { readPersonMeasure } from '../../layers/core/server/measures/people'
import { minutes } from '../fixtures/modules/rota/server/contributions/core.person-measure/minutes'
import { env, person, rows, setModule } from './helpers'

const period = { from: '2026-08-01', to: '2027-07-31' }
const reader = (extra: string[] = []) => person(['reports.people.view', 'rota.hours.view', ...extra])
const asModule = <T>(module: string | undefined, actor: Actor, fn: () => Promise<T>) =>
  runInContext({ env, actor, cache: {}, requestId: newId('req'), module }, fn)
const read = (actor: Actor, query: Parameters<typeof readPersonMeasure>[1] = period, module: string | undefined = 'reports') =>
  asModule(module, actor, () => readPersonMeasure('rota.minutes', query, actor))
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
const audited = (accountId: string) => rows<{ action: string, ability: string, detail: string }>("SELECT action, ability, detail FROM core_audit WHERE actor_account_id = ? AND action = 'read'", accountId)

beforeAll(async () => {
  await setModule('reports', true)
  await setModule('rota', true)
})
afterAll(async () => {
  await setModule('reports', false)
  await setModule('rota', false)
})
beforeEach(() => {
  Object.assign(minutes, { answer: 'rows', rows: [], asked: [] })
})
afterEach(async () => {
  await setModule('rota', true)
})

describe('readPersonMeasure', () => {
  it('answers accounts and numbers to Reports, and audits the read without a name or a figure (P1, P5)', async () => {
    const alex = newId('acc')
    minutes.rows = [{ person: alex, value: 240 }]
    const actor = reader()
    expect(await read(actor)).toEqual({ state: 'ok', rows: [{ person: alex, value: 240 }] })
    const [row] = await audited(actor.accountId!)
    expect(row).toMatchObject({ action: 'read', ability: 'rota.hours.view' })
    expect(JSON.parse(row!.detail)).toEqual({ figure: 'rota.minutes', ...period, state: 'ok', rows: 1 })
    expect(row!.detail).not.toContain(alex)
  })
  it('refuses any module but Reports, and a reader who is not a person, before asking the module', async () => {
    expect(await refusal(read(reader(), period, 'rota'))).toBe('core.person-measure.reports-only')
    expect(await refusal(read(reader(), period, ''))).toBe('core.person-measure.reports-only')
    expect(await refusal(read({ kind: 'job' } as Actor))).toBe('core.person-measure.reports-only')
    expect(minutes.asked).toHaveLength(0)
  })
  it('needs both reports.people.view and the figure\'s own ability', async () => {
    expect(await refusal(read(person(['rota.hours.view'])))).toBe('core.access.denied')
    expect(await refusal(read(person(['reports.people.view'])))).toBe('core.access.denied')
    expect(minutes.asked).toHaveLength(0)
  })
  it('lets a grant on a production read that production only, and audits the scope as ids', async () => {
    const production = newId('prd')
    const actor = person(['reports.people.view'], { grants: [{ ability: 'reports.people.view', via: 'role' }, { ability: 'rota.hours.view', record: { type: 'core.production', id: production }, via: 'grant:one-production' }] })
    expect(await read(actor, { ...period, scope: { production } })).toMatchObject({ state: 'ok' })
    expect(await refusal(read(actor, { ...period, scope: { production: newId('prd') } }))).toBe('core.access.denied')
    expect(await refusal(read(actor))).toBe('core.access.denied')
    const [row] = await audited(actor.accountId!)
    expect(JSON.parse(row!.detail)).toMatchObject({ scope: 'production', scopeId: production })
  })
  it('refuses a breakdown the figure does not offer, and a period that runs backwards', async () => {
    expect(await refusal(read(reader(), { ...period, by: 'venue' }))).toBe('core.measure.unknown-breakdown')
    expect(await refusal(read(reader(), { from: '2026-11-30', to: '2026-11-01' }))).toBe('core.measure.period')
  })
  it('passes the one asked breakdown through', async () => {
    const alex = newId('acc')
    minutes.rows = [{ person: alex, keys: { 'committee-year': '2026' }, value: 90 }]
    expect(await read(reader(), { ...period, by: 'committee-year' })).toEqual({ state: 'ok', rows: minutes.rows })
    expect(minutes.asked[0]).toMatchObject({ by: 'committee-year' })
  })
  it('answers unavailable, never nought, when the module is off or the read fails (P6)', async () => {
    await setModule('rota', false)
    expect(await read(reader())).toEqual({ state: 'unavailable', reason: 'module-off' })
    await setModule('rota', true)
    minutes.answer = 'throw'
    expect(await read(reader())).toEqual({ state: 'unavailable', reason: 'failed' })
  })
  it('treats a name, an email address, a key not asked or a field more as a bad answer, and still audits the read', async () => {
    const actor = reader()
    for (const bad of [
      { rows: [{ person: 'Alex Smith', value: 1 }] },
      { rows: [{ person: newId('acc'), value: 1, name: 'Alex Smith' }] },
      { rows: [{ person: newId('acc'), keys: { performance: 'alex@example.org' }, value: 1 }] },
      { rows: [{ person: newId('acc'), keys: { performance: newId('acc') }, value: 1 }] },
      { rows: [{ person: newId('acc'), keys: { day: '2026-11-24' }, value: 1 }] },
      { rows: [{ person: newId('acc'), value: -1 }] },
    ]) {
      minutes.answer = bad
      expect(await read(actor, { ...period, by: 'performance' })).toEqual({ state: 'unavailable', reason: 'bad-answer' })
    }
    expect((await audited(actor.accountId!)).map(r => JSON.parse(r.detail).state)).toEqual(Array.from({ length: 6 }, () => 'unavailable'))
  })
})
