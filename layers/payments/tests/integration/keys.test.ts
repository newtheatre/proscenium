// Provider keys typed into the app (Matt, 17 November): saved encrypted per provider account, never
// sent back, read before the module-wide value and before a Worker secret of the same name.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUnit, credential, credentialStatus, newId, setCredential } from '#kit'
import { methodsFor } from '../../server/services'
import keysRoute from '../../server/api/payments/providers/[id]/keys.post'
import listRoute from '../../server/api/payments/providers.get'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const SECRET = 'PAYMENTS_STRIPE_SECRET_KEY'
const KEYS = ['PAYMENTS_STRIPE_SECRET_KEY', 'PAYMENTS_STRIPE_WEBHOOK_SECRET', 'PAYMENTS_STRIPE_PUBLISHABLE_KEY']
const secrets = env as unknown as Record<string, string | undefined>
const handle = server({ 'POST /api/payments/providers/:id/keys': keysRoute, 'GET /api/payments/providers': listRoute })
const admin = person(['payments.provider.manage'])
let account: string
let other: string

async function stripeAccount(): Promise<string> {
  const id = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'stripe', 'Stripe', '[\"online\"]', 'test', 1, 1, 1)").bind(id).run()
  return id
}

beforeAll(async () => {
  for (const id of ['finance', 'payments']) await setModule(id, true)
  account = await stripeAccount()
  other = await stripeAccount()
})

beforeEach(async () => {
  for (const name of KEYS) Reflect.deleteProperty(secrets, name)
  await env.DB.prepare("DELETE FROM core_credentials WHERE module_id = 'payments'").run()
})

describe('credential()', () => {
  it('reads the account\'s saved key, then the module-wide one, then the Worker secret', async () => {
    expect(await inContext(() => credential(SECRET, account))).toBeNull()
    secrets[SECRET] = 'sk_test_from_cloudflare'
    expect(await inContext(() => credential(SECRET, account))).toBe('sk_test_from_cloudflare')
    await inContext(async () => {
      const unit = createUnit()
      await setCredential(unit.view(), SECRET, 'sk_test_for_everyone_0000', { by: null })
      await unit.commit()
    })
    expect(await inContext(() => credential(SECRET, account))).toBe('sk_test_for_everyone_0000')
    await inContext(async () => {
      const unit = createUnit()
      await setCredential(unit.view(), SECRET, 'sk_test_for_this_account_4242', { scope: account, by: null })
      await unit.commit()
    })
    expect(await inContext(() => credential(SECRET, account))).toBe('sk_test_for_this_account_4242')
    expect(await inContext(() => credential(SECRET, other))).toBe('sk_test_for_everyone_0000')
    expect(await inContext(() => credentialStatus([SECRET], other))).toMatchObject([{ source: 'saved-for-module', hint: '0000' }])
  })

  it('stores the key encrypted, with only its last four characters in the clear', async () => {
    await inContext(async () => {
      const unit = createUnit()
      await setCredential(unit.view(), SECRET, 'sk_test_never_in_the_clear_9876', { scope: account, by: null })
      await unit.commit()
    })
    const [row] = await rows<{ ciphertext: string, hint: string }>("SELECT ciphertext, hint FROM core_credentials WHERE module_id = 'payments' AND name = ? AND scope = ?", SECRET, account)
    expect(row!.ciphertext.startsWith('v1.')).toBe(true)
    expect(row!.ciphertext).not.toContain('never_in_the_clear')
    expect(row!.hint).toBe('sk_test_…9876')
  })
})

describe('POST /api/payments/providers/:id/keys', () => {
  it('saves keys for one account, offers it for payment, and never sends a key back', async () => {
    const res = await call(handle, 'POST', `/api/payments/providers/${account}/keys`, { actor: admin, body: { keys: { PAYMENTS_STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmnop1234', PAYMENTS_STRIPE_WEBHOOK_SECRET: 'whsec_abcdefghijklmnop5678', PAYMENTS_STRIPE_PUBLISHABLE_KEY: 'pk_test_abcdefghijklmnop9012' } } })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('abcdefghijklmnop')
    expect(JSON.parse(text).keys).toEqual([
      { name: 'PAYMENTS_STRIPE_SECRET_KEY', source: 'saved', hint: '1234', start: 'sk_test_' },
      { name: 'PAYMENTS_STRIPE_WEBHOOK_SECRET', source: 'saved', hint: '5678', start: 'whsec_' },
      { name: 'PAYMENTS_STRIPE_PUBLISHABLE_KEY', source: 'saved', hint: '9012', start: 'pk_test_' },
    ])
    const offered = await inContext(() => methodsFor('online'))
    expect(offered.some(m => m.providerAccountId === account)).toBe(true)
    expect(offered.some(m => m.providerAccountId === other)).toBe(false)
    const listed = await (await call(handle, 'GET', '/api/payments/providers', { actor: admin })).text()
    expect(listed).not.toContain('abcdefghijklmnop')
    const audit = await rows<{ detail: string }>("SELECT detail FROM core_audit WHERE record_type = 'payments.provider-account' AND record_id = ? AND action = 'update'", account)
    expect(audit.map(a => JSON.parse(a.detail).credential).sort()).toEqual([...KEYS].sort())
  })

  it('removes a saved key, and refuses a key the provider does not have', async () => {
    await call(handle, 'POST', `/api/payments/providers/${account}/keys`, { actor: admin, body: { keys: { PAYMENTS_STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmnop1234' } } })
    const removed = await (await call(handle, 'POST', `/api/payments/providers/${account}/keys`, { actor: admin, body: { keys: { PAYMENTS_STRIPE_SECRET_KEY: null } } })).json() as { keys: { name: string, source: string | null }[] }
    expect(removed.keys.find(k => k.name === SECRET)!.source).toBeNull()
    const wrong = await call(handle, 'POST', `/api/payments/providers/${account}/keys`, { actor: admin, body: { keys: { PAYMENTS_SUMUP_API_KEY: 'x' } } })
    expect(wrong.status).toBe(422)
  })

  it('is refused without payments.provider.manage', async () => {
    const res = await call(handle, 'POST', `/api/payments/providers/${account}/keys`, { actor: person([]), body: { keys: { PAYMENTS_STRIPE_SECRET_KEY: 'sk_test_x' } } })
    expect(res.status).toBe(403)
  })
})
