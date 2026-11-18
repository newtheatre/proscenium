// First-run setup makes the first Owner (ID-37), and only once.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Authenticator } from './authenticator'
import { Browser, address, env, leaveIdentity, reset, setUpOwner, useIdentity } from './helpers'
import { rows } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

describe('first-run setup (ID-37)', () => {
  it('will not finish without a passkey, or without a recovery code typed back', async () => {
    const browser = new Browser()
    const device = new Authenticator()
    expect((await browser.get('/api/core/setup')).body).toEqual({ needed: true })
    const start = await browser.post('/api/core/setup/start', { name: 'Olive Owner', address: address() })
    expect(start.status).toBe(200)
    expect((await browser.post('/api/core/setup/finish', { code: 'abcde-fghjk' })).body.code).toBe('core.setup.passkey-needed')
    const passkey = await browser.post('/api/core/setup/passkey', { response: await device.create(start.body.options) })
    expect(passkey.body.recoveryCodes).toHaveLength(10)
    expect((await browser.post('/api/core/setup/finish', { code: 'abcde-fghjk' })).body.code).toBe('core.setup.code-wrong')
    expect(await rows('SELECT id FROM core_accounts')).toEqual([])
    // A time zone not on the list is refused beside its field (AC-11).
    const wrong = await new Browser().post('/api/core/setup/start', { name: 'Olive Owner', address: address(), theatre: 'The Lyric', timeZone: 'Mars/Olympus' })
    expect(wrong.status).toBe(422)
    expect(wrong.body.fields).toEqual({ timeZone: 'invalid' })
  })

  it('makes one Owner with a passkey, saved recovery codes and a strong session; then cannot run again', async () => {
    const browser = new Browser()
    const device = new Authenticator()
    // The test site already has a name; set it aside so setup can give one.
    const keys = '(\'core.site.name\', \'core.locale.time-zone\')'
    const before = await rows<{ key: string, value: string, updated_at: number }>(`SELECT key, value, updated_at FROM core_settings WHERE key IN ${keys}`)
    await env.DB.prepare(`DELETE FROM core_settings WHERE key IN ${keys}`).run()
    const ownerId = await setUpOwner(browser, device, address(), { theatre: 'The Lyric', timeZone: 'Europe/Dublin' })
    // The theatre's name and time zone asked on the first step are saved with the Owner (AC-11).
    const saved = await rows<{ key: string, value: string }>(`SELECT key, value FROM core_settings WHERE key IN ${keys} ORDER BY key`)
    await env.DB.prepare(`DELETE FROM core_settings WHERE key IN ${keys}`).run()
    for (const r of before) await env.DB.prepare('INSERT INTO core_settings (key, value, updated_at) VALUES (?, ?, ?)').bind(r.key, r.value, r.updated_at).run()
    expect(saved).toEqual([{ key: 'core.locale.time-zone', value: '"Europe/Dublin"' }, { key: 'core.site.name', value: '"The Lyric"' }])
    const me = await browser.get('/api/core/me')
    expect(me.body).toMatchObject({ signedIn: true, session: { assurance: 'strong' }, passkeys: 1 })
    // The Owner, fixed, and core's preset roles, which the theatre owns from then on (FH-4).
    expect(await rows('SELECT key, fixed FROM core_roles ORDER BY fixed DESC, key')).toEqual([{ key: 'owner', fixed: 1 }, { key: 'access-coordinator', fixed: 0 }])
    expect(await rows('SELECT account_id, granted_by FROM core_grants')).toEqual([{ account_id: ownerId, granted_by: ownerId }])
    expect(await rows('SELECT count(*) AS n FROM core_recovery_codes WHERE account_id = ?', ownerId)).toEqual([{ n: 10 }])

    expect((await browser.get('/api/core/setup')).body).toEqual({ needed: false })
    const again = await new Browser().post('/api/core/setup/start', { name: 'Ivan Intruder', address: address() })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('core.setup.done')
  })
})
