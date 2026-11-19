// The Payments "Set up" card asks for a provider's keys only once an active account with that
// provider lacks them, never for a provider nobody has added.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setCredential } from '#kit'
import list from '../../../core/server/api/core/modules/index.get'
import { call, env, inContext, person, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({ 'GET /api/core/modules': list })
const STRIPE = ['PAYMENTS_STRIPE_SECRET_KEY', 'PAYMENTS_STRIPE_WEBHOOK_SECRET', 'PAYMENTS_STRIPE_PUBLISHABLE_KEY']
const SUMUP = ['PAYMENTS_SUMUP_API_KEY', 'PAYMENTS_SUMUP_AFFILIATE_KEY', 'PAYMENTS_SUMUP_APP_ID']

interface Credential { name: string, step: boolean | null }

async function steps(): Promise<Map<string, boolean | null>> {
  const body = await (await call(handle, 'GET', '/api/core/modules', { actor: person(['core.health.view']) })).json() as { modules: { id: string, credentials: Credential[] }[] }
  return new Map(body.modules.find(m => m.id === 'payments')!.credentials.map(c => [c.name, c.step]))
}

async function account(provider: string, active = 1): Promise<string> {
  const id = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, ?, 'Account', '[\"desk\"]', 'test', ?, 1, 1)").bind(id, provider, active).run()
  return id
}

beforeAll(async () => {
  for (const id of ['finance', 'payments']) await setModule(id, true)
  await env.DB.prepare('UPDATE payments_provider_accounts SET active = 0').run()
  await env.DB.prepare("DELETE FROM core_credentials WHERE module_id = 'payments'").run()
})

describe('the Payments "Set up" card', () => {
  it('asks for no provider keys while no account uses a provider', async () => {
    await account('stripe', 0)
    const now = await steps()
    for (const name of [...STRIPE, ...SUMUP]) expect(now.get(name)).toBeNull()
  })

  it('asks for a provider\'s keys once an active account with it lacks them, and stops once they are saved', async () => {
    const id = await account('stripe')
    let now = await steps()
    for (const name of STRIPE) expect(now.get(name)).toBe(false)
    for (const name of SUMUP) expect(now.get(name)).toBeNull()
    await inContext(async () => {
      const unit = createUnit()
      for (const name of STRIPE) await setCredential(unit.view(), name, `${name.toLowerCase()}_0000`, { scope: id, by: null })
      await unit.commit()
    })
    now = await steps()
    for (const name of STRIPE) expect(now.get(name)).toBeNull()
  })
})
