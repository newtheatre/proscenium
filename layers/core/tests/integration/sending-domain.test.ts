// C-52: setting the sending domain up automatically. Cloudflare's API is a recorder here; the
// request's host is the site's host, so each test sends its request to the address it needs.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock, usePoint, type Actor } from '#kit'
import { runJob } from '#kit/jobs'
import { reconcileDue } from '#kit/external'
import { MailError, setMailer, type OutgoingEmail } from '../../server/notifications/mailer'
import { setCloudflareFetch, zoneCandidates } from '../../server/notifications/cloudflare'
import setUpDomain from '../../server/api/core/notifications/set-up-domain.post'
import senderState from '../../server/api/core/notifications/sender.get'
import verifyDomain from '../../server/api/core/notifications/verify-domain.post'
import { env, inContext, person, rows, sent, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/notifications/set-up-domain': setUpDomain,
  'GET /api/core/notifications/sender': senderState,
  'POST /api/core/notifications/verify-domain': verifyDomain,
})
const admin = () => person(['core.sender.manage'])
const secrets = env as unknown as Record<string, string | undefined>

/** What the pretend Cloudflare knows, and every call made to it. */
const cloudflare = { zones: [] as { id: string, name: string, status: string }[], subdomains: new Map<string, { tag: string, name: string, enabled: boolean }[]>(), calls: [] as { method: string, path: string, body?: unknown, auth: string | null }[], failCreate: false, hang: false }
const mails: OutgoingEmail[] = []
let failWith: string | undefined

function reply(result: unknown, status = 200) {
  return new Response(JSON.stringify(status < 300 ? { success: true, errors: [], messages: [], result } : { success: false, errors: [{ code: 1000, message: 'refused' }], messages: [] }), { status })
}

beforeEach(() => {
  secrets.CORE_CLOUDFLARE_TOKEN = 'test-cloudflare-token'
  cloudflare.zones = [{ id: 'zone-1', name: 'example.org', status: 'active' }]
  cloudflare.subdomains = new Map()
  cloudflare.calls = []
  cloudflare.failCreate = false
  cloudflare.hang = false
  mails.length = 0
  sent.length = 0
  failWith = undefined
  setMailer(async (message) => {
    if (failWith) throw new MailError(failWith, true)
    mails.push(message)
    return { messageId: 'test' }
  })
  setCloudflareFetch(async (input, init) => {
    const url = new URL(input)
    const path = url.pathname.replace('/client/v4', '')
    const method = init?.method ?? 'GET'
    cloudflare.calls.push({ method, path: path + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init?.headers).get('authorization') })
    if (path === '/zones') return reply(cloudflare.zones.filter(z => !url.searchParams.get('name') || z.name === url.searchParams.get('name')))
    const match = /^\/zones\/([^/]+)\/email\/sending\/subdomains$/.exec(path)
    if (match) {
      const list = cloudflare.subdomains.get(match[1]!) ?? []
      if (method === 'GET') return reply(list)
      if (cloudflare.hang) return new Promise<Response>(() => {})
      if (cloudflare.failCreate) return reply(null, 403)
      const name = (JSON.parse(String(init!.body)) as { name: string }).name
      const made = list.find(s => s.name === name) ?? { tag: `tag-${name}`, name, enabled: true }
      made.enabled = true
      cloudflare.subdomains.set(match[1]!, [...list.filter(s => s.name !== name), made])
      return reply(made)
    }
    return reply(null, 404)
  })
})

afterEach(async () => {
  delete secrets.CORE_CLOUDFLARE_TOKEN
  setCloudflareFetch()
  setMailer()
  setClock()
  later = 0
  await env.DB.batch([
    env.DB.prepare("DELETE FROM core_settings WHERE key LIKE 'core.notifications.%' OR key LIKE 'core.organisation.%'"),
    env.DB.prepare('DELETE FROM core_jobs'),
  ])
})

async function setSettings(values: Record<string, unknown>) {
  await inContext(async () => {
    const unit = createUnit()
    for (const [key, value] of Object.entries(values)) await changeSetting(unit, key, value, { reset: value === null, confirm: true })
    await unit.commit()
  })
  sent.length = 0
}

function request(method: string, origin: string, path: string, options: { actor?: Actor, body?: unknown } = {}) {
  const host = new URL(origin).host
  const headers: Record<string, string> = { 'content-type': 'application/json', host, origin }
  if (options.actor) headers['x-test-actor'] = JSON.stringify(options.actor)
  return handle(new Request(`${origin}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }))
}

const setting = async (key: string) => (await rows<{ value: string }>('SELECT value FROM core_settings WHERE key = ?', key))[0]?.value ?? null

/** Runs the jobs queued so far, once each, a minute and a bit later than the last run. */
let later = 0
async function runQueued(): Promise<void> {
  later += 61_000
  setClock(Date.now() + later)
  const batch = sent.splice(0)
  for (const message of batch) await inContext(() => runJob(message.jobId), { kind: 'job' })
}

/** The verify jobs queued and not yet run, with how long each waits. */
async function verifyJobs() {
  const ids = sent.map(m => m.jobId)
  const found = await rows<{ id: string }>('SELECT id FROM core_jobs WHERE name = \'core.verify-sending-domain\' AND state = \'queued\' AND id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
  return sent.filter(m => found.some(f => f.id === m.jobId))
}

describe('setting the sending domain up automatically (C-52)', () => {
  it('finds the zone by the longest suffix of the site\'s host', () => {
    expect(zoneCandidates('mail.tickets.example.org')).toEqual(['mail.tickets.example.org', 'tickets.example.org', 'example.org'])
  })

  it('asks Cloudflare for mail.<host>, makes it the sending domain and verifies it once Cloudflare accepts it', async () => {
    await setSettings({ 'core.organisation.contact-email': 'box-office@example.org' })
    const state = await (await request('GET', 'https://tickets.example.org', '/api/core/notifications/sender', { actor: admin() })).json()
    expect(state).toEqual({ domain: null, verified: false, contactSet: true, automatic: { proposed: 'mail.tickets.example.org', unavailable: null } })

    const response = await request('POST', 'https://tickets.example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ domain: 'mail.tickets.example.org', verifying: true })
    const created = cloudflare.calls.find(c => c.method === 'POST')!
    expect(created).toMatchObject({ path: '/zones/zone-1/email/sending/subdomains', body: { name: 'mail.tickets.example.org' }, auth: 'Bearer test-cloudflare-token' })
    expect(await setting('core.notifications.sending-domain')).toBe('"mail.tickets.example.org"')
    const [first] = await verifyJobs()
    expect(first!.delaySeconds).toBeGreaterThanOrEqual(60)

    // Cloudflare is not ready for a minute or two: the job tries again.
    failWith = 'E_EMAIL_SENDING_NOT_READY'
    await runQueued()
    expect(mails).toHaveLength(0)
    expect(await verifyJobs()).toHaveLength(1)
    failWith = undefined
    await runQueued()
    expect(mails.map(m => m.to)).toEqual(['box-office@example.org'])
    expect(await setting('core.notifications.verified-domain')).toBe('"mail.tickets.example.org"')
  })

  it('sends one test message when the button is pressed while the automatic one waits', async () => {
    await setSettings({ 'core.organisation.contact-email': 'box-office@example.org' })
    await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    expect(await verifyJobs()).toHaveLength(1)

    const pressed = await request('POST', 'https://example.org', '/api/core/notifications/verify-domain', { actor: admin(), body: {} })
    expect(pressed.status).toBe(200)
    expect(mails).toHaveLength(1)
    // The waiting job was cancelled, so running it later sends nothing.
    await runQueued()
    expect(mails).toHaveLength(1)
    expect(await rows("SELECT state FROM core_jobs WHERE name = 'core.verify-sending-domain'")).toEqual([{ state: 'cancelled' }])
  })

  it('sends nothing by hand while the automatic test is being sent, and resumes the retries if Cloudflare is not ready', async () => {
    await setSettings({ 'core.organisation.contact-email': 'box-office@example.org' })
    await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    await env.DB.prepare("UPDATE core_jobs SET state = 'running' WHERE name = 'core.verify-sending-domain'").run()
    const busy = await request('POST', 'https://example.org', '/api/core/notifications/verify-domain', { actor: admin(), body: {} })
    expect(busy.status).toBe(409)
    expect((await busy.json()).code).toBe('core.notifications.test-under-way')
    expect(mails).toHaveLength(0)

    await env.DB.prepare("UPDATE core_jobs SET state = 'queued' WHERE name = 'core.verify-sending-domain'").run()
    failWith = 'E_EMAIL_SENDING_NOT_READY'
    const early = await request('POST', 'https://example.org', '/api/core/notifications/verify-domain', { actor: admin(), body: {} })
    expect((await early.json()).code).toBe('core.notifications.domain-not-ready')
    const resumed = await verifyJobs()
    expect(resumed.map(m => m.delaySeconds)).toEqual([60])
    failWith = undefined
    await runQueued()
    expect(mails).toHaveLength(1)
  })

  it('adopts a subdomain that already exists, and a second press changes nothing', async () => {
    cloudflare.subdomains.set('zone-1', [{ tag: 'old-tag', name: 'mail.example.org', enabled: false }])
    for (let i = 0; i < 2; i++) {
      const response = await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
      expect(response.status).toBe(200)
    }
    expect(cloudflare.subdomains.get('zone-1')).toEqual([{ tag: 'old-tag', name: 'mail.example.org', enabled: true }])
    expect(await setting('core.notifications.sending-domain')).toBe('"mail.example.org"')
  })

  it('drops www. and uses the sending label from the settings', async () => {
    await setSettings({ 'core.notifications.sending-label': 'notifications' })
    const response = await request('POST', 'https://www.example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    expect(await response.json()).toEqual({ domain: 'notifications.example.org', verifying: true })
  })

  it('asks before replacing a different sending domain', async () => {
    await setSettings({ 'core.notifications.sending-domain': 'post.example.org', 'core.notifications.verified-domain': 'post.example.org' })
    const refused = await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    expect(refused.status).toBe(409)
    expect((await refused.json()).code).toBe('core.notifications.replace-domain')
    expect(cloudflare.calls.filter(c => c.method === 'POST')).toHaveLength(0)

    const replaced = await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: { replace: true } })
    expect(replaced.status).toBe(200)
    expect(await setting('core.notifications.sending-domain')).toBe('"mail.example.org"')
    expect(await setting('core.notifications.verified-domain')).toBeNull()
  })

  it('offers nothing on workers.dev, or without a token, and says why', async () => {
    const onWorkers = await (await request('GET', 'https://proscenium.someone.workers.dev', '/api/core/notifications/sender', { actor: admin() })).json()
    expect(onWorkers.automatic).toEqual({ proposed: null, unavailable: 'workers-dev' })
    const refused = await request('POST', 'https://proscenium.someone.workers.dev', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    expect((await refused.json()).code).toBe('core.notifications.automatic-workers-dev')

    delete secrets.CORE_CLOUDFLARE_TOKEN
    const noToken = await (await request('GET', 'https://example.org', '/api/core/notifications/sender', { actor: admin() })).json()
    expect(noToken.automatic).toEqual({ proposed: 'mail.example.org', unavailable: 'no-token' })
    expect(JSON.stringify(noToken)).not.toContain('test-cloudflare-token')
    expect(cloudflare.calls).toHaveLength(0)
  })

  it('refuses a zone the token cannot see, and a create Cloudflare refuses, leaving the settings alone', async () => {
    const elsewhere = await request('POST', 'https://theatre.example.net', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    expect((await elsewhere.json()).code).toBe('core.notifications.automatic-no-zone')
    cloudflare.failCreate = true
    const failed = await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    expect(failed.status).toBe(502)
    const body = await failed.json()
    expect(body.code).toBe('core.notifications.automatic-failed')
    expect(JSON.stringify(body)).not.toContain('test-cloudflare-token')
    expect(await setting('core.notifications.sending-domain')).toBeNull()
  })

  it('needs the ability to manage senders, and a fresh passkey check', async () => {
    expect((await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: person([]), body: {} })).status).toBe(403)
    const stale = await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: person(['core.sender.manage'], { reassertedAt: Date.now() - 86_400_000 }), body: {} })
    expect(stale.status).toBe(403)
    expect((await stale.json()).code).toBe('core.access.not-fresh')
    expect(cloudflare.calls).toHaveLength(0)
  })

  it('settles a call that got no answer by asking Cloudflare later', async () => {
    cloudflare.hang = true
    await setSettings({ 'core.external.timeout': 1 })
    const response = await request('POST', 'https://example.org', '/api/core/notifications/set-up-domain', { actor: admin(), body: {} })
    expect(response.status).toBe(503)
    // Cloudflare did make it, in the end.
    cloudflare.subdomains.set('zone-1', [{ tag: 'late', name: 'mail.example.org', enabled: true }])
    expect(await inContext(() => reconcileDue(Date.now() + 6 * 60_000), { kind: 'job' })).toBe(1)
    expect(await setting('core.notifications.sending-domain')).toBe('"mail.example.org"')
    await env.DB.prepare("DELETE FROM core_settings WHERE key = 'core.external.timeout'").run()
  })

  it('says on the health screen whether the token is set and reaches Cloudflare, never the token', async () => {
    const check = async () => inContext(async () => {
      const [found] = (await usePoint<{ check: () => Promise<{ state: string, sentence: string }> }>('core.health-check')).filter(c => c.id === 'core.cloudflare-token')
      return found!.value.check()
    })
    expect((await check()).state).toBe('ok')
    setCloudflareFetch(async () => reply(null, 403))
    const refused = await check()
    expect(refused.state).toBe('warning')
    expect(JSON.stringify(refused)).not.toContain('test-cloudflare-token')
    delete secrets.CORE_CLOUDFLARE_TOKEN
    expect((await check()).sentence).toContain('No Cloudflare token')
  })
})
