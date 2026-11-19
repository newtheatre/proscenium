// Keys a site set up before 19 November still holds on the Worker (Matt: nothing the site can hold is
// set on the Worker). They are never read; the minute's tick moves each into the app once.
import { afterEach, describe, expect, it } from 'vitest'
import { credential, useSetting } from '#kit'
import { adoptWorkerSecrets } from '#kit/secrets'
import getRoute from '../../server/api/core/credentials/index.get'
import postRoute from '../../server/api/core/credentials/index.post'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const secrets = env as unknown as Record<string, string | undefined>
const handle = server({ 'GET /api/core/credentials': getRoute, 'POST /api/core/credentials': postRoute })
const signIn = person(['core.identity-settings.manage'])

afterEach(() => {
  for (const name of ['CORE_GOOGLE_CLIENT_SECRET', 'CORE_TURNSTILE_SECRET_KEY', 'NUXT_PUBLIC_TURNSTILE_SITE_KEY']) Reflect.deleteProperty(secrets, name)
})

describe('a key left on the Worker', () => {
  it('is never read, and the tick moves it into the app once, with the Turnstile site key', async () => {
    secrets.CORE_GOOGLE_CLIENT_SECRET = 'GOCSPX-from-cloudflare-abcd1234'
    secrets.NUXT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAAAsitekey'
    expect(await inContext(() => credential('CORE_GOOGLE_CLIENT_SECRET'))).toBeNull()
    const before = await (await call(handle, 'GET', '/api/core/credentials?names=CORE_GOOGLE_CLIENT_SECRET', { actor: signIn })).json() as { keys: { source: string | null }[] }
    expect(before.keys[0]!.source).toBeNull()
    expect(await inContext(() => adoptWorkerSecrets())).toEqual(['CORE_GOOGLE_CLIENT_SECRET', 'NUXT_PUBLIC_TURNSTILE_SITE_KEY'])
    Reflect.deleteProperty(secrets, 'CORE_GOOGLE_CLIENT_SECRET')
    expect(await inContext(() => credential('CORE_GOOGLE_CLIENT_SECRET'))).toBe('GOCSPX-from-cloudflare-abcd1234')
    expect(await inContext(() => useSetting('core.sign-in.turnstile-site-key'))).toBe('0x4AAAAAAAsitekey')
    const audit = await rows<{ detail: string }>("SELECT detail FROM core_audit WHERE json_extract(detail, '$.credential') = 'CORE_GOOGLE_CLIENT_SECRET'")
    expect(audit.every(a => !a.detail.includes('abcd1234'))).toBe(true)
    expect(await inContext(() => adoptWorkerSecrets())).toEqual([])
  })

  it('never replaces a key saved in the app', async () => {
    await call(handle, 'POST', '/api/core/credentials', { actor: signIn, body: { keys: { CORE_TURNSTILE_SECRET_KEY: 'typed-in-the-app-2222222' } } })
    secrets.CORE_TURNSTILE_SECRET_KEY = 'from-cloudflare'
    secrets.CORE_GOOGLE_CLIENT_SECRET = 'from-cloudflare-too'
    expect(await inContext(() => adoptWorkerSecrets())).toEqual([])
    expect(await inContext(() => credential('CORE_TURNSTILE_SECRET_KEY'))).toBe('typed-in-the-app-2222222')
    expect(await inContext(() => credential('CORE_GOOGLE_CLIENT_SECRET'))).toBe('GOCSPX-from-cloudflare-abcd1234')
  })
})
