// The Modules screen's seam (F-16, F-17, F-18): the list of modules with what each needs, and the
// switch, which can switch on the modules a module requires when the person confirmed them.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import list from '../../server/api/core/modules/index.get'
import putModule from '../../server/api/core/modules/[id].put'
import { resetRateLimits } from '#kit/ratelimit'
import { call, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/modules': list,
  'PUT /api/core/modules/:id': putModule,
})

const owner = () => person(['core.modules.manage'])
const viewer = () => person(['core.health.view'])
// cardco requires payments, which requires finance.
const chain = ['finance', 'payments', 'cardco']
const dependants = ['box-office', 'snacks', 'tickets']

interface Listed { id: string, on: boolean, alwaysOn: boolean, requires: string[], requiredBy: string[], alsoOn: string[], screens: { id: string }[] }

beforeAll(async () => {
  for (const id of [...chain, ...dependants]) await setModule(id, false)
})
afterAll(async () => {
  for (const id of [...chain, ...dependants]) await setModule(id, false)
})
afterEach(() => resetRateLimits())

const switchModule = (id: string, body: unknown, actor = owner()) => call(handle, 'PUT', `/api/core/modules/${id}`, { actor, body })
const enabled = async (id: string) => (await rows<{ enabled: number }>('SELECT enabled FROM core_modules WHERE module_id = ?', id))[0]?.enabled === 1

describe('the Modules screen', () => {
  it('lists every module with what it needs and what switching it on would also switch on', async () => {
    const response = await call(handle, 'GET', '/api/core/modules', { actor: owner() })
    expect(response.status).toBe(200)
    const body = await response.json() as { modules: Listed[], manage: boolean }
    expect(body.manage).toBe(true)
    const byId = new Map(body.modules.map(m => [m.id, m]))
    expect(byId.get('core')).toMatchObject({ alwaysOn: true, on: true })
    expect(byId.get('cardco')).toMatchObject({ on: false, requires: ['payments'], alsoOn: ['finance', 'payments'] })
    expect(byId.get('payments')!.requiredBy).toEqual(expect.arrayContaining(['cardco', 'box-office']))
    expect(byId.get('box-office')!.screens.length).toBeGreaterThan(0)
  })

  it('is open to whoever may view health, without the switches', async () => {
    const response = await call(handle, 'GET', '/api/core/modules', { actor: viewer() })
    expect(response.status).toBe(200)
    expect((await response.json() as { manage: boolean }).manage).toBe(false)
    expect((await switchModule('finance', { on: true }, viewer())).status).toBe(403)
    expect(await enabled('finance')).toBe(false)
  })

  it('refuses to switch on a module whose requirements are off, naming them', async () => {
    const response = await switchModule('cardco', { on: true })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'core.module.requires' })
    expect(await enabled('cardco')).toBe(false)
  })

  it('switches on the required modules with it once confirmed, those required first', async () => {
    const response = await switchModule('cardco', { on: true, withRequired: true })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ moduleId: 'cardco', on: true, switched: chain })
    for (const id of chain) expect(await enabled(id)).toBe(true)
    const audit = await rows<{ record_id: string }>("SELECT record_id FROM core_audit WHERE record_type = 'core.module' AND record_id IN ('finance', 'payments', 'cardco')")
    expect(new Set(audit.map(a => a.record_id))).toEqual(new Set(chain))
  })

  it('refuses to switch off a module another one that is on needs, and switches it off once that is off', async () => {
    const refused = await switchModule('payments', { on: false })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: 'core.module.required' })
    expect((await switchModule('cardco', { on: false })).status).toBe(200)
    expect(await switchModule('payments', { on: false }).then(r => r.json())).toMatchObject({ switched: ['payments'] })
    expect(await enabled('payments')).toBe(false)
  })
})
