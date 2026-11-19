// A provider account can be taken out of use and put back (Matt, 19 November): one out of use is
// not offered for payment, and its history stays.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { methodsFor } from '../../server/services'
import patchRoute from '../../server/api/payments/providers/[id]/index.patch'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({ 'PATCH /api/payments/providers/:id': patchRoute })
const admin = person(['payments.provider.manage'])
let account: string

beforeAll(async () => {
  for (const id of ['finance', 'payments']) await setModule(id, true)
  account = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'attested-card', 'Card machine', '[\"desk\"]', 'live', 1, 1, 1)").bind(account).run()
})

const offered = async () => (await inContext(() => methodsFor('desk'))).some(m => m.providerAccountId === account)

describe('taking a provider account out of use', () => {
  it('stops offering it, audits the change, and puts it back', async () => {
    expect(await offered()).toBe(true)
    const off = await call(handle, 'PATCH', `/api/payments/providers/${account}`, { actor: admin, body: { active: false } })
    expect(off.status).toBe(200)
    expect(await off.json()).toMatchObject({ active: false })
    expect(await offered()).toBe(false)
    expect(await rows("SELECT action FROM core_audit WHERE record_type = 'payments.provider-account' AND record_id = ?", account)).toEqual([{ action: 'update' }])
    expect((await call(handle, 'PATCH', `/api/payments/providers/${account}`, { actor: admin, body: { active: true } })).status).toBe(200)
    expect(await offered()).toBe(true)
  })

  it('is refused without the ability, and for an account that does not exist', async () => {
    expect((await call(handle, 'PATCH', `/api/payments/providers/${account}`, { actor: person([]), body: { active: false } })).status).toBe(403)
    expect((await call(handle, 'PATCH', '/api/payments/providers/ppa_nothing', { actor: admin, body: { active: false } })).status).toBe(404)
  })
})
