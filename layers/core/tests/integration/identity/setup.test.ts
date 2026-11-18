// First-run setup makes the first Owner (ID-37), and only once, and records the theatre's details.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Authenticator } from './authenticator'
import { Browser, SETUP_THEATRE, address, leaveIdentity, reset, setUpOwner, useIdentity } from './helpers'
import { rows } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

describe('first-run setup (ID-37)', () => {
  it('will not finish without a passkey, or without a recovery code typed back', async () => {
    const browser = new Browser()
    const device = new Authenticator()
    const asked = (await browser.get('/api/core/setup')).body
    expect(asked).toMatchObject({ needed: true })
    expect(asked.timeZones).toContain('Europe/London')
    expect(asked.countries).toContain('GB')
    const start = await browser.post('/api/core/setup/start', { name: 'Olive Owner', address: address(), theatre: SETUP_THEATRE })
    expect(start.status).toBe(200)
    expect((await browser.post('/api/core/setup/finish', { code: 'abcde-fghjk' })).body.code).toBe('core.setup.passkey-needed')
    const passkey = await browser.post('/api/core/setup/passkey', { response: await device.create(start.body.options) })
    expect(passkey.body.recoveryCodes).toHaveLength(10)
    expect((await browser.post('/api/core/setup/finish', { code: 'abcde-fghjk' })).body.code).toBe('core.setup.code-wrong')
    expect(await rows('SELECT id FROM core_accounts')).toEqual([])
  })

  it('asks for the theatre with the Owner, and refuses a time zone or country not on the list', async () => {
    const browser = new Browser()
    const missing = await browser.post('/api/core/setup/start', { name: 'Olive Owner', address: address() })
    expect(missing.status).toBe(422)
    const wrong = await browser.post('/api/core/setup/start', { name: 'Olive Owner', address: address(), theatre: { name: 'The Rep', timeZone: 'Mars/Olympus', country: 'XX', contactEmail: 'not an address' } })
    expect(wrong.status).toBe(422)
    expect(Object.keys(wrong.body.fields)).toEqual(expect.arrayContaining(['theatre.timeZone', 'theatre.country', 'theatre.contactEmail']))
  })

  it('makes one Owner with a passkey, saved recovery codes and a strong session; then cannot run again', async () => {
    const browser = new Browser()
    const device = new Authenticator()
    const ownerId = await setUpOwner(browser, device)
    const me = await browser.get('/api/core/me')
    expect(me.body).toMatchObject({ signedIn: true, session: { assurance: 'strong' }, passkeys: 1 })
    expect(await rows('SELECT key, fixed FROM core_roles')).toEqual([{ key: 'owner', fixed: 1 }])
    expect(await rows('SELECT account_id, granted_by FROM core_grants')).toEqual([{ account_id: ownerId, granted_by: ownerId }])
    expect(await rows('SELECT count(*) AS n FROM core_recovery_codes WHERE account_id = ?', ownerId)).toEqual([{ n: 10 }])
    // The theatre's details from the second step are saved with the Owner.
    const saved = await rows<{ key: string, value: string }>("SELECT key, value FROM core_settings WHERE key IN ('core.site.name', 'core.locale.time-zone', 'core.organisation.country') ORDER BY key")
    expect(saved.map(r => [r.key, JSON.parse(r.value)])).toEqual([['core.locale.time-zone', 'UTC'], ['core.organisation.country', 'GB'], ['core.site.name', 'The Test Theatre']])

    expect((await browser.get('/api/core/setup')).body).toEqual({ needed: false })
    const again = await new Browser().post('/api/core/setup/start', { name: 'Ivan Intruder', address: address(), theatre: SETUP_THEATRE })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('core.setup.done')
  })
})
