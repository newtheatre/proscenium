// Keys typed into the app on the shared keys form (Matt, 17 November): the generic credentials routes
// behind KeysCard, the keys that moved from Worker secrets, and the readers that now use them.
import { beforeEach, describe, expect, it } from 'vitest'
import { credential } from '#kit'
import { verifyTurnstile } from '#kit/turnstile'
import { cloudflareToken } from '../../server/notifications/cloudflare'
import getRoute from '../../server/api/core/credentials/index.get'
import postRoute from '../../server/api/core/credentials/index.post'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const NAMES = ['CORE_TURNSTILE_SECRET_KEY', 'CORE_GOOGLE_CLIENT_SECRET', 'CORE_CLOUDFLARE_TOKEN']
const secrets = env as unknown as Record<string, string | undefined>
const handle = server({ 'GET /api/core/credentials': getRoute, 'POST /api/core/credentials': postRoute })
const signIn = person(['core.identity-settings.manage'])
const sender = person(['core.sender.manage'])

beforeEach(async () => {
  for (const name of NAMES) Reflect.deleteProperty(secrets, name)
  await env.DB.prepare("DELETE FROM core_credentials WHERE module_id = 'core'").run()
})

describe('GET /api/core/credentials', () => {
  it('says where each key the viewer manages comes from, and leaves out the rest', async () => {
    secrets.CORE_GOOGLE_CLIENT_SECRET = 'from-cloudflare'
    const res = await call(handle, 'GET', `/api/core/credentials?names=${NAMES.join(',')}`, { actor: signIn })
    expect(res.status).toBe(200)
    const { keys } = await res.json() as { keys: { name: string, source: string | null, labelKey: string }[] }
    expect(keys.map(k => [k.name, k.source])).toEqual([['CORE_TURNSTILE_SECRET_KEY', null], ['CORE_GOOGLE_CLIENT_SECRET', 'worker-secret']])
    expect(keys[0]!.labelKey).toBe('core.credentials.turnstile-secret-key.label')
  })

  it('is not found for someone who manages none of them, and offers no per-record key', async () => {
    expect((await call(handle, 'GET', '/api/core/credentials?names=CORE_CLOUDFLARE_TOKEN', { actor: signIn })).status).toBe(404)
    expect((await call(handle, 'GET', '/api/core/credentials?names=PAYMENTS_STRIPE_SECRET_KEY', { actor: person(['payments.provider.manage']) })).status).toBe(404)
  })
})

describe('POST /api/core/credentials', () => {
  it('saves a key encrypted, never sends it back, audits it by name, and the readers use it', async () => {
    const res = await call(handle, 'POST', '/api/core/credentials', { actor: sender, body: { keys: { CORE_CLOUDFLARE_TOKEN: 'cf_token_abcdefghijklmnop_7777' } } })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('abcdefghijklmnop')
    expect(JSON.parse(text).keys).toEqual([{ name: 'CORE_CLOUDFLARE_TOKEN', source: 'saved', hint: '7777' }])
    const [row] = await rows<{ ciphertext: string }>("SELECT ciphertext FROM core_credentials WHERE module_id = 'core' AND name = 'CORE_CLOUDFLARE_TOKEN'")
    expect(row!.ciphertext).not.toContain('abcdefghijklmnop')
    expect(await inContext(() => cloudflareToken())).toBe('cf_token_abcdefghijklmnop_7777')
    const audit = await rows<{ detail: string }>("SELECT detail FROM core_audit WHERE action = 'update' AND detail LIKE '%CORE_CLOUDFLARE_TOKEN%'")
    expect(audit.length).toBeGreaterThan(0)
    expect(audit.every(a => !a.detail.includes('abcdefghijklmnop'))).toBe(true)
  })

  it('removes a saved key, after which the Worker secret of the same name is used again', async () => {
    secrets.CORE_TURNSTILE_SECRET_KEY = 'from-cloudflare'
    await call(handle, 'POST', '/api/core/credentials', { actor: signIn, body: { keys: { CORE_TURNSTILE_SECRET_KEY: 'typed-in-the-app-0000000' } } })
    expect(await inContext(() => credential('CORE_TURNSTILE_SECRET_KEY'))).toBe('typed-in-the-app-0000000')
    const removed = await (await call(handle, 'POST', '/api/core/credentials', { actor: signIn, body: { keys: { CORE_TURNSTILE_SECRET_KEY: null } } })).json() as { keys: { source: string | null }[] }
    expect(removed.keys[0]!.source).toBe('worker-secret')
    expect(await inContext(() => credential('CORE_TURNSTILE_SECRET_KEY'))).toBe('from-cloudflare')
  })

  it('refuses a key the person does not manage, one saved per record, and an unknown one', async () => {
    expect((await call(handle, 'POST', '/api/core/credentials', { actor: signIn, body: { keys: { CORE_CLOUDFLARE_TOKEN: 'x' } } })).status).toBe(403)
    expect((await call(handle, 'POST', '/api/core/credentials', { actor: person(['payments.provider.manage']), body: { keys: { PAYMENTS_STRIPE_SECRET_KEY: 'x' } } })).status).toBe(422)
    expect((await call(handle, 'POST', '/api/core/credentials', { actor: signIn, body: { keys: { CORE_NOT_A_KEY: 'x' } } })).status).toBe(422)
    expect(await rows("SELECT 1 FROM core_credentials WHERE module_id = 'core'")).toEqual([])
  })

  it('asks for a fresh sign-in', async () => {
    const stale = person(['core.identity-settings.manage'], { reassertedAt: 0 } as never)
    const res = await call(handle, 'POST', '/api/core/credentials', { actor: stale, body: { keys: { CORE_GOOGLE_CLIENT_SECRET: 'x' } } })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code?: string }).code).toBe('core.access.not-fresh')
  })
})

describe('the bot check', () => {
  it('is quietly off with no key, and needs a token once one is saved', async () => {
    expect(await inContext(() => verifyTurnstile(undefined, 'unknown'))).toBe(true)
    await call(handle, 'POST', '/api/core/credentials', { actor: signIn, body: { keys: { CORE_TURNSTILE_SECRET_KEY: 'typed-in-the-app-1111111' } } })
    expect(await inContext(() => verifyTurnstile(undefined, 'unknown'))).toBe(false)
  })
})
