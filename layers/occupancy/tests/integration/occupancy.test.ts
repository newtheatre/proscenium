// C-65 and OC-01, OC-03: occupancy is a support module, on exactly while a module that requires it
// is on, never switched by itself; its one read gathers performances, closures and every
// core.space-busy contribution for a window, labelled only where the reader may see them.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, isEnabled, isRefusal, newId } from '#kit'
import { setModuleEnabled } from '#kit/modules-store'
import { isSpaceFree } from '#modules/core'
import { occupancy } from '../../server/services'
import { calls } from '../../../../tests/fixtures/modules/rehearse/server/contributions/core.space-busy/rehearse'
import listModules from '../../../core/server/api/core/modules/index.get'
import createVenue from '../../../core/server/api/core/venues/index.post'
import addSpace from '../../../core/server/api/core/venues/[id]/spaces/index.post'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({ 'GET /api/core/modules': listModules, 'POST /api/core/venues': createVenue, 'POST /api/core/venues/:id/spaces': addSpace })
const admin = person(['core.venue.manage'])

const NIGHT = Date.UTC(2026, 11, 3, 19, 30) // 3 December, 19:30 London
const HOUR = 3_600_000
let venue: string
let main: string
let studio: string
let production: string

async function switchRehearse(on: boolean): Promise<string[]> {
  return await inContext(async () => {
    const unit = createUnit()
    const switched = await setModuleEnabled(unit.view(), 'rehearse', on)
    await unit.commit()
    return switched
  })
}

beforeAll(async () => {
  await setModule('rehearse', false)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
  const made = await (await call(handle, 'POST', '/api/core/venues', { actor: admin, body: { name: 'Occupancy venue' } })).json() as { venueId: string, spaceId: string }
  venue = made.venueId
  main = made.spaceId
  const kind = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.space-kind' AND slug = 'studio'"))[0]!.id
  studio = (await (await call(handle, 'POST', `/api/core/venues/${venue}/spaces`, { actor: admin, body: { name: 'Studio', kindTermId: kind } })).json() as { id: string }).id
  production = newId('prd')
  await env.DB.batch([
    env.DB.prepare("INSERT INTO core_productions (id, slug, title, kind, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, 'Hamlet', 'own', 'draft', 1, 1, 0, 0, 0)").bind(production, production),
    env.DB.prepare("INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, ends_at, operating_day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, '2026-12-03', 'scheduled', 0)").bind(newId('perf'), production, venue, main, NIGHT, NIGHT + 3 * HOUR),
    env.DB.prepare("INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, ends_at, operating_day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, '2026-12-04', 'draft', 0)").bind(newId('perf'), production, venue, main, NIGHT + 24 * HOUR, NIGHT + 27 * HOUR),
    env.DB.prepare("INSERT INTO core_closures (id, venue_id, space_id, kind, title, starts_at, ends_at, all_day, blocks_performances, source, created_at) VALUES (?, ?, NULL, 'closure', 'Electrical works', ?, ?, 0, 1, 'manual', 0)").bind(newId('clo'), venue, NIGHT - 10 * HOUR, NIGHT - 8 * HOUR),
  ])
})
beforeEach(() => {
  calls.length = 0
})
afterAll(async () => {
  await setModule('rehearse', false)
})

describe('a support module (C-65)', () => {
  it('is off while nothing that requires it is on, and comes on and goes off with its requirer', async () => {
    expect(await inContext(() => isEnabled('occupancy'))).toBe(false)
    expect(await switchRehearse(true)).toEqual(['rehearse', 'occupancy'])
    expect(await inContext(() => isEnabled('occupancy'))).toBe(true)
    const announced = await rows<{ name: string, payload: string }>("SELECT name, payload FROM core_events WHERE name IN ('core.module.enabled', 'core.module.disabled') ORDER BY announced_at DESC LIMIT 2")
    expect(announced.map(e => [e.name, JSON.parse(e.payload).moduleId])).toEqual(expect.arrayContaining([['core.module.enabled', 'occupancy'], ['core.module.enabled', 'rehearse']]))
    expect(await switchRehearse(false)).toEqual(['rehearse', 'occupancy'])
    expect(await inContext(() => isEnabled('occupancy'))).toBe(false)
  })

  it('cannot be switched by itself', async () => {
    const refused = await inContext(async () => {
      try {
        await setModuleEnabled(createUnit().view(), 'occupancy', true)
      }
      catch (error) {
        return isRefusal(error) ? error.code : String(error)
      }
    })
    expect(refused).toBe('core.module.support')
  })

  it('is listed on the Modules screen with no switch and the modules that need it (OC-03)', async () => {
    const listed = await (await call(handle, 'GET', '/api/core/modules', { actor: person(['core.health.view']) })).json() as { modules: { id: string, support: boolean, alwaysOn: boolean, on: boolean, requiredBy: string[], alsoOn: string[] }[] }
    expect(listed.modules.find(m => m.id === 'occupancy')).toMatchObject({ support: true, alwaysOn: false, on: false })
    expect(listed.modules.find(m => m.id === 'occupancy')!.requiredBy.toSorted()).toEqual(['availability', 'rehearse', 'spaces', 'training'])
    // Switching its requirer on asks about nothing else: occupancy simply comes with it.
    expect(listed.modules.find(m => m.id === 'rehearse')).toMatchObject({ support: false, alsoOn: [] })
  })

  it('ignores a row a support module was given by hand', async () => {
    await setModule('occupancy', true)
    expect(await inContext(() => isEnabled('occupancy'))).toBe(false)
    await env.DB.prepare("DELETE FROM core_modules WHERE module_id = 'occupancy'").run()
  })
})

describe('the occupancy view (OC-01)', () => {
  beforeAll(() => switchRehearse(true))

  it('gathers performances, closures and contributions for each space, soonest first, on their operating days', async () => {
    calls.push({ spaceId: studio, kind: 'rehearsal-call', from: NIGHT, to: NIGHT + 2 * HOUR, yields: true, record: { type: 'rehearse.call', id: 'call_1' }, label: 'Act 2 blocking' })
    const answer = await inContext(() => occupancy({ spaceIds: [main, studio], from: NIGHT - 12 * HOUR, to: NIGHT + 36 * HOUR }, person(['core.production.view'])))
    const [mainItems, studioItems] = answer.map(s => s.items)
    expect(mainItems!.map(i => [i.kind, i.day, i.yields, i.label])).toEqual([
      ['closure', '2026-12-03', false, 'Electrical works'],
      ['performance-scheduled', '2026-12-03', false, 'Hamlet'],
      ['performance-draft', '2026-12-04', false, 'Hamlet'],
    ])
    // The venue's closure reaches the studio too; the call is the fixture's own.
    expect(studioItems!.map(i => [i.kind, i.module, i.label])).toEqual([
      ['closure', 'core', 'Electrical works'],
      ['rehearsal-call', 'rehearse', 'Act 2 blocking'],
    ])
  })

  it('says only "busy" where the reader may not see what it is (O2)', async () => {
    calls.push({ spaceId: main, kind: 'rehearsal-call', from: NIGHT - 4 * HOUR, to: NIGHT - 2 * HOUR, yields: true, record: { type: 'rehearse.call', id: 'call_2' }, label: 'Fight call' })
    const answer = await inContext(() => occupancy({ spaceIds: [main], from: NIGHT - 6 * HOUR, to: NIGHT + 6 * HOUR }, null))
    expect(answer[0]!.items.map(i => [i.kind, i.label])).toEqual([['rehearsal-call', null], ['performance-scheduled', null]])
  })

  it('refuses more than 31 days or 30 spaces at once (O3)', async () => {
    const asked = (query: Parameters<typeof occupancy>[0]) => inContext(() => occupancy(query, null).then(() => 'ok', error => isRefusal(error) ? error.code : String(error)))
    expect(await asked({ spaceIds: [main], from: NIGHT, to: NIGHT + 32 * 24 * HOUR })).toBe('occupancy.too-long')
    expect(await asked({ spaceIds: Array.from({ length: 31 }, () => newId('spc')), from: NIGHT, to: NIGHT + HOUR })).toBe('occupancy.too-many-spaces')
    expect(await asked({ spaceIds: [main], from: NIGHT, to: NIGHT })).toBe('occupancy.window')
  })
})

describe('isSpaceFree and core.space-busy', () => {
  it('sees another module\'s times, unless asked to leave that module out', async () => {
    calls.push({ spaceId: studio, kind: 'rehearsal-call', from: NIGHT, to: NIGHT + HOUR, yields: true, record: { type: 'rehearse.call', id: 'call_3' }, label: null })
    expect(await inContext(() => isSpaceFree(studio, NIGHT + HOUR, NIGHT + 2 * HOUR))).toBe(true)
    expect(await inContext(() => isSpaceFree(studio, NIGHT + HOUR / 2, NIGHT + 2 * HOUR))).toBe(false)
    expect(await inContext(() => isSpaceFree(studio, NIGHT + HOUR / 2, NIGHT + 2 * HOUR, { except: 'rehearse' }))).toBe(true)
  })
})
