// Download my data (ID-15): a fresh re-assertion asks for it, a job builds it, the person is told
// by email, the link sits in their account until core.privacy.export-lifetime, and only they can
// read it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Browser, clearSetting, deliver, env, goStale, leaveIdentity, reset, setSetting, staff, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { setMailer, useMailer, type OutgoingEmail } from '../../../server/notifications/mailer'
import { mayReadRecordFile } from '../../../server/files/service'
import { crc32, zip } from '../../../server/identity/zip'

const sent: OutgoingEmail[] = []

beforeAll(async () => {
  await useIdentity()
  const inner = useMailer()
  setMailer(async (email) => {
    sent.push(email)
    return inner(email)
  })
  await setSetting('core.privacy.contact', 'privacy@example.org')
})
afterAll(async () => {
  await clearSetting('core.privacy.contact')
  leaveIdentity()
})
beforeEach(() => {
  reset()
  sent.length = 0
})

const to = (addressee: string) => sent.filter(e => e.to === addressee)

/** Somebody signed in, with a passkey, a fresh session and the address they signed in with. */
async function person(name = 'Dana Download') {
  const { browser, device, accountId } = await staff()
  const [{ address: mine }] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', accountId)
  await browser.patch('/api/core/me', { name })
  await deliver()
  sent.length = 0
  return { browser, device, accountId, mine: mine! }
}

/** The names of the files in a stored zip, read from its central directory. */
function namesIn(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    const length = view.getUint16(at + 28, true)
    const extra = view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
    names.push(new TextDecoder().decode(bytes.slice(at + 46, at + 46 + length)))
    at += 46 + length + extra
  }
  return names
}

describe('the zip writer', () => {
  it('writes the CRC-32 every unzip tool checks, and a central directory that lists each file', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926)
    expect(namesIn(zip([{ name: 'index.html', bytes: '<p>hello</p>' }, { name: 'records/a.json', bytes: '[]' }]))).toEqual(['index.html', 'records/a.json'])
  })
})

describe('downloading my data (ID-15)', () => {
  it('needs a fresh re-assertion', async () => {
    const { browser, accountId } = await person()
    await goStale(accountId)
    expect((await browser.post('/api/core/me/data-requests', { kind: 'export' })).body.code).toBe('core.access.not-fresh')
  })

  it('builds the download, emails the person, and lists it in their account until it lapses', async () => {
    const { browser, accountId, mine } = await person()
    const asked = await browser.post('/api/core/me/data-requests', { kind: 'export' })
    expect(asked.status).toBe(200)
    await deliver()

    expect(to(mine).map(e => e.subject)).toEqual(['Your data from The Test Theatre is ready'])
    const [request] = (await browser.get('/api/core/me/data-requests')).body.requests
    expect(request).toMatchObject({ kind: 'export', state: 'done', download: { url: expect.stringMatching(/^\/files\/fil_/) } })
    expect(request.download.until - Date.now()).toBeGreaterThan(6 * 86_400_000)

    const fileId = request.download.url.split('/').pop()
    const [file] = await rows<{ object_key: string, owner_id: string, slot: string, expires_at: number }>('SELECT object_key, owner_id, slot, expires_at FROM core_files WHERE id = ?', fileId)
    expect(file).toMatchObject({ owner_id: accountId, slot: 'core.data-download' })
    const bytes = new Uint8Array(await (await env.FILES!.get(file!.object_key))!.arrayBuffer())
    const names = namesIn(bytes)
    expect(names[0]).toBe('index.html')
    expect(names).toContain('records/core/core_accounts.json')
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('Dana Download')
    expect(text).toContain(mine)
    // Secrets are left out: no hashes of tokens, no passkey keys.
    expect(text).not.toContain('token_hash')
    expect(text).not.toContain('public_key')
  })

  it('only the person can read their download', async () => {
    const { browser, accountId } = await person()
    const other = await person('Olly Other')
    await browser.post('/api/core/me/data-requests', { kind: 'export' })
    await deliver()
    const [file] = await rows<{ id: string, slot: string, owner_type: string, owner_id: string }>('SELECT id, slot, owner_type, owner_id FROM core_files WHERE owner_id = ? AND slot = \'core.data-download\'', accountId)
    const asActor = (id: string) => ({ kind: 'person' as const, accountId: id, assurance: 'strong' as const })
    expect(await inContext(() => mayReadRecordFile(asActor(accountId), file!))).toBe(true)
    expect(await inContext(() => mayReadRecordFile(asActor(other.accountId), file!))).toBe(false)
  })

  it('one at a time: a second request while one is being made is refused', async () => {
    const { browser } = await person()
    expect((await browser.post('/api/core/me/data-requests', { kind: 'export' })).status).toBe(200)
    expect((await browser.post('/api/core/me/data-requests', { kind: 'export' })).body.code).toBe('core.data-request.open')
  })

  it('includes the access application, opened, when there is one', async () => {
    await setSetting('core.access-scheme.enabled', true)
    try {
      const { browser, accountId } = await person()
      const form = (await browser.get('/api/core/me/access')).body
      await browser.post('/api/core/me/access', { needs: [{ term: form.needs[0].id, note: 'Near the aisle please' }], companions: 1 })
      await browser.post('/api/core/me/data-requests', { kind: 'export' })
      await deliver()
      const [file] = await rows<{ object_key: string }>('SELECT object_key FROM core_files WHERE owner_id = ? AND slot = \'core.data-download\'', accountId)
      const bytes = new Uint8Array(await (await env.FILES!.get(file!.object_key))!.arrayBuffer())
      expect(namesIn(bytes)).toContain('more/core/access-application.json')
      expect(new TextDecoder().decode(bytes)).toContain('Near the aisle please')
    }
    finally {
      await clearSetting('core.access-scheme.enabled')
    }
  })

  it('a new Browser cannot ask for one', async () => {
    expect((await new Browser().post('/api/core/me/data-requests', { kind: 'export' })).status).toBe(401)
  })
})
