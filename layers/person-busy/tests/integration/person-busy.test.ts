// C-66: person-busy merges every core.person-busy contribution for the accounts asked, with source,
// chunked at 90 ids; it names nobody else, and a switched-off contributor answers nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUnit, isEnabled, isRefusal, newId } from '#kit'
import { setModuleEnabled } from '#kit/modules-store'
import { personBusy, personsBusy } from '../../server/services'
import { crew } from '../../../../tests/fixtures/modules/crewcall/server/contributions/core.person-busy/crewcall'
import createVenue from '../../../core/server/api/core/venues/index.post'
import { call, env, inContext, person, server } from '../../../../tests/integration/helpers'

const handle = server({ 'POST /api/core/venues': createVenue })

const NIGHT = Date.UTC(2026, 11, 3, 19, 30)
const HOUR = 3_600_000
const alex = newId('acc')
const sam = newId('acc')
const stranger = newId('acc')
let scheduled: string
let draft: string

async function switchCrewcall(on: boolean): Promise<string[]> {
  return await inContext(async () => {
    const unit = createUnit()
    const switched = await setModuleEnabled(unit.view(), 'crewcall', on)
    await unit.commit()
    return switched
  })
}
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

beforeAll(async () => {
  const made = await (await call(handle, 'POST', '/api/core/venues', { actor: person(['core.venue.manage']), body: { name: 'Busy venue' } })).json() as { venueId: string, spaceId: string }
  const [venue, space] = [made.venueId, made.spaceId]
  const production = newId('prd')
  const cancelled = newId('perf')
  scheduled = newId('perf')
  draft = newId('perf')
  await env.DB.batch([
    env.DB.prepare("INSERT INTO core_productions (id, slug, title, kind, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, 'Hamlet', 'own', 'draft', 1, 1, 0, 0, 0)").bind(production, production),
    env.DB.prepare("INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, doors_at, ends_at, operating_day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, '2026-12-03', 'scheduled', 0)").bind(scheduled, production, venue, space, NIGHT, NIGHT - HOUR / 2, NIGHT + 3 * HOUR),
    env.DB.prepare("INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, ends_at, operating_day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, '2026-12-04', 'draft', 0)").bind(draft, production, venue, space, NIGHT + 24 * HOUR, NIGHT + 27 * HOUR),
    env.DB.prepare("INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, ends_at, operating_day, state, cancelled_at, cancel_reason_term_id, created_at) VALUES (?, ?, ?, ?, ?, ?, '2026-12-05', 'cancelled', 1, (SELECT id FROM core_terms LIMIT 1), 0)").bind(cancelled, production, venue, space, NIGHT + 48 * HOUR, NIGHT + 51 * HOUR),
    env.DB.prepare("INSERT INTO core_production_credits (id, production_id, account_id, credited_name, role, section_term_id, visibility, sort) VALUES (?, ?, ?, 'Alex', 'Hamlet', (SELECT id FROM core_terms LIMIT 1), 'public', 0)").bind(newId('crd'), production, alex),
    env.DB.prepare("INSERT INTO core_production_credits (id, production_id, account_id, credited_name, role, section_term_id, visibility, sort) VALUES (?, ?, ?, 'Someone', 'Ophelia', (SELECT id FROM core_terms LIMIT 1), 'public', 1)").bind(newId('crd'), production, stranger),
  ])
  await switchCrewcall(true)
})
beforeEach(() => {
  Object.assign(crew, { calls: [], asked: [], fail: false, strangers: false })
})
afterAll(async () => {
  await switchCrewcall(false)
})

describe('person-busy (C-66)', () => {
  it('comes on with a module that requires it, and goes off with it', async () => {
    expect(await inContext(() => isEnabled('person-busy'))).toBe(true)
    expect(await switchCrewcall(false)).toEqual(['crewcall', 'person-busy'])
    expect(await refusal(inContext(() => personBusy(alex, NIGHT, NIGHT + HOUR)))).toBe('core.module.off')
    expect(await switchCrewcall(true)).toEqual(['crewcall', 'person-busy'])
  })

  it('answers core\'s credits from doors to end, firm only when scheduled, and never a cancelled night', async () => {
    const rows = await inContext(() => personBusy(alex, NIGHT - 24 * HOUR, NIGHT + 72 * HOUR))
    expect(rows).toEqual([
      { accountId: alex, kind: 'performance', from: NIGHT - HOUR / 2, to: NIGHT + 3 * HOUR, firm: true, labelKey: 'core.person-busy.performance', record: { type: 'core.performance', id: scheduled }, source: 'core' },
      { accountId: alex, kind: 'performance', from: NIGHT + 24 * HOUR, to: NIGHT + 27 * HOUR, firm: false, labelKey: 'core.person-busy.performance', record: { type: 'core.performance', id: draft }, source: 'core' },
    ])
  })

  it('merges every contributor with its source, sorted by person then time', async () => {
    crew.calls = [{ accountId: sam, kind: 'call', from: NIGHT - 2 * HOUR, to: NIGHT, firm: true, labelKey: 'crewcall.call', record: null }]
    const rows = await inContext(() => personsBusy([alex, sam], NIGHT - 4 * HOUR, NIGHT + 4 * HOUR))
    expect(rows.map(r => [r.accountId, r.source, r.kind])).toEqual([[alex, 'core', 'performance'], [sam, 'crewcall', 'call']].sort((a, b) => a[0]!.localeCompare(b[0]!)))
  })

  it('names nobody not asked about, even when a contributor does (person-busy-no-strangers)', async () => {
    crew.strangers = true
    crew.calls = [{ accountId: stranger, kind: 'call', from: NIGHT, to: NIGHT + HOUR, firm: true, labelKey: 'crewcall.call', record: null }]
    const rows = await inContext(() => personsBusy([alex], NIGHT - 4 * HOUR, NIGHT + 4 * HOUR))
    expect(rows.map(r => r.accountId)).toEqual([alex])
  })

  it('asks each contributor at most 90 accounts at a time', async () => {
    const many = Array.from({ length: 200 }, () => newId('acc'))
    await inContext(() => personsBusy(many, NIGHT, NIGHT + HOUR))
    expect(crew.asked.map(ids => ids.length)).toEqual([90, 90, 20])
  })

  it('leaves out a contributor that fails, and answers the rest', async () => {
    crew.fail = true
    expect((await inContext(() => personBusy(alex, NIGHT, NIGHT + HOUR))).map(r => r.source)).toEqual(['core'])
  })

  it('refuses a window that runs backwards or is too long', async () => {
    expect(await refusal(inContext(() => personBusy(alex, NIGHT, NIGHT)))).toBe('person-busy.window')
    expect(await refusal(inContext(() => personBusy(alex, NIGHT, NIGHT + 401 * 24 * HOUR)))).toBe('person-busy.too-long')
  })
})
