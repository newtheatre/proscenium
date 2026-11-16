// C-27, C-28, C-32: a module sends one email from its own job; a failure retries; nothing is sent
// until the sending domain is set and verified; each topic can use a named sender.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, enqueue, usePoint } from '#kit'
import { MailError, setMailer, type OutgoingEmail } from '../../server/notifications/mailer'
import verifyDomain from '../../server/api/core/notifications/verify-domain.post'
import putSender from '../../server/api/core/senders/[key].put'
import putRouting from '../../server/api/core/notifications/routing/[topic].put'
import { runJob } from '#kit/jobs'
import { call, env, inContext, person, rows, sent, server } from '../../../../tests/integration/helpers'

const mails: OutgoingEmail[] = []
let failWith: string | undefined

const handle = server({
  'POST /api/core/notifications/verify-domain': verifyDomain,
  'PUT /api/core/senders/:key': putSender,
  'PUT /api/core/notifications/routing/:topic': putRouting,
})
const admin = () => person(['core.sender.manage'])

async function setSettings(values: Record<string, unknown>) {
  await inContext(async () => {
    const unit = createUnit()
    for (const [key, value] of Object.entries(values)) await changeSetting(unit, key, value, value === null ? { reset: true } : {})
    await unit.commit()
  })
  sent.length = 0
}

/** Runs the jobs queued so far, once each: a retry's own message waits for the next call. */
async function deliver(): Promise<string[]> {
  const batch = sent.splice(0)
  const outcomes: string[] = []
  for (const message of batch) outcomes.push(await inContext(() => runJob(message.jobId), { kind: 'job' }))
  return outcomes
}

async function sendTicket(address = 'guest@example.org', key?: string) {
  await inContext(() => enqueue('notify.send-ticket', { address, link: 'https://tickets.example.org/t/abc', key }))
}

async function verify() {
  await setSettings({ 'core.notifications.sending-domain': 'mail.example.org', 'core.organisation.contact-email': 'box-office@example.org', 'core.site.name': 'The Little Theatre' })
  const response = await call(handle, 'POST', '/api/core/notifications/verify-domain', { actor: admin(), body: {} })
  expect(response.status).toBe(200)
  mails.length = 0
  sent.length = 0
}

beforeEach(() => {
  sent.length = 0
  mails.length = 0
  failWith = undefined
  setMailer(async (message) => {
    if (failWith) throw new MailError(failWith, failWith !== 'E_VALIDATION_ERROR')
    mails.push(message)
    return { messageId: 'test' }
  })
})
afterEach(async () => {
  setMailer()
  await env.DB.batch([
    env.DB.prepare("DELETE FROM core_settings WHERE key LIKE 'core.notifications.%' OR key LIKE 'core.organisation.%' OR key = 'core.site.name'"),
    env.DB.prepare('DELETE FROM core_notification_routing'),
    env.DB.prepare('DELETE FROM core_sender_identities'),
    env.DB.prepare('DELETE FROM core_jobs'),
  ])
  await env.CACHE!.list().then(list => Promise.all(list.keys.map(k => env.CACHE!.delete(k.name))))
})

describe('sending an email from a job (C-27)', () => {
  it('sends nothing until the sending domain is set and verified, and the job waits to retry', async () => {
    await sendTicket()
    expect(await deliver()).toEqual(['retrying'])
    expect(mails).toHaveLength(0)
    const [job] = await rows<{ last_error: string, payload: string }>("SELECT last_error, payload FROM core_jobs WHERE name = 'notify.send-ticket'")
    expect(job!.last_error).toMatch(/^core\.notifications\.domain-unverified/)
    expect(job!.last_error).not.toContain('guest@example.org')
  })

  it('renders the type\'s wording with the brand and the theatre\'s name, and sends it', async () => {
    await verify()
    await sendTicket()
    expect(await deliver()).toEqual(['done'])
    expect(mails).toHaveLength(1)
    const mail = mails[0]!
    expect(mail.to).toBe('guest@example.org')
    expect(mail.from).toEqual({ name: 'The Little Theatre', email: 'no-reply@mail.example.org' })
    expect(mail.replyTo).toBe('box-office@example.org')
    expect(mail.subject).toBe('Your ticket for The Little Theatre')
    expect(mail.text).toContain('Your seat is B12.')
    expect(mail.text).toContain('Open your ticket: https://tickets.example.org/t/abc')
    expect(mail.html).toContain('<strong>B12</strong>')
    expect(mail.html).toContain('href="https://tickets.example.org/t/abc"')
  })

  it('writes nothing about the message to the database', async () => {
    await verify()
    await sendTicket()
    await deliver()
    for (const table of ['core_audit', 'core_events', 'core_setting_changes']) {
      const dump = JSON.stringify(await rows(`SELECT * FROM ${table}`))
      expect(dump).not.toContain('guest@example.org')
      expect(dump).not.toContain('tickets.example.org')
    }
  })

  it('sends once for two calls with the same dedupe key', async () => {
    await verify()
    await sendTicket('guest@example.org', 'order-1')
    await sendTicket('guest@example.org', 'order-1')
    await sendTicket('guest@example.org', 'order-2')
    expect(await deliver()).toEqual(['done', 'done', 'done'])
    expect(mails).toHaveLength(2)
  })

  it('refuses variables the type does not declare, a missing one, and an unsafe address', async () => {
    await verify()
    const { notifyAddress } = await import('../../server/notifications/send')
    const attempt = (variables: Record<string, string>) => inContext(() => notifyAddress(createUnit(), 'notify.ticket-ready', { address: 'a@example.org', variables }))
    await expect(attempt({ link: 'https://x.example.org', seat: 'A1', extra: 'x' })).rejects.toMatchObject({ code: 'core.notifications.bad-variables', fields: { extra: expect.any(String) } })
    await expect(attempt({ link: 'https://x.example.org' })).rejects.toMatchObject({ fields: { seat: 'required' } })
    await expect(attempt({ link: 'http://x.example.org', seat: 'A1' })).rejects.toMatchObject({ fields: { link: expect.stringContaining('https') } })
    await expect(attempt({ link: 'javascript:alert(1)', seat: 'A1' })).rejects.toMatchObject({ fields: { link: expect.any(String) } })
    await expect(attempt({ link: 'https://x.example.org', seat: 'A1', theatre: 'x' })).rejects.toMatchObject({ fields: { theatre: 'is filled by core' } })
    await expect(inContext(() => notifyAddress(createUnit(), 'notify.nothing', { address: 'a@example.org', variables: {} }))).rejects.toMatchObject({ code: 'core.notifications.unknown-type' })
    expect(mails).toHaveLength(0)
  })

  it('escapes what the caller gives, so a variable cannot add markup', async () => {
    await verify()
    const { notifyAddress } = await import('../../server/notifications/send')
    await inContext(() => notifyAddress(createUnit(), 'notify.ticket-ready', { address: 'a@example.org', variables: { link: 'https://x.example.org/?a=1&b="2"', seat: '<img src=x onerror=alert(1)>' } }))
    expect(mails[0]!.html).not.toContain('<img')
    expect(mails[0]!.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(mails[0]!.html).toContain('href="https://x.example.org/?a=1&amp;b=&quot;2&quot;"')
  })
})

describe('when sending fails (C-28)', () => {
  it('retries with growing waits, then marks the job dead and announces it, keeping only the provider\'s code', async () => {
    await verify()
    failWith = 'E_INTERNAL_SERVER_ERROR'
    await sendTicket()
    const outcomes: string[] = []
    for (let i = 0; i < 3; i++) {
      outcomes.push(...await deliver())
      await env.DB.prepare("UPDATE core_jobs SET run_after = 0 WHERE state = 'queued'").run()
    }
    expect(outcomes).toEqual(['retrying', 'retrying', 'dead'])
    const [job] = await rows<{ state: string, last_error: string }>("SELECT state, last_error FROM core_jobs WHERE name = 'notify.send-ticket'")
    expect(job).toEqual({ state: 'dead', last_error: 'core.notifications.send-failed: E_INTERNAL_SERVER_ERROR' })
    expect(await rows("SELECT id FROM core_events WHERE name = 'core.job.died'")).not.toHaveLength(0)
  })

  it('treats a domain the provider will not send from as unverified', async () => {
    await verify()
    failWith = 'E_SENDER_NOT_VERIFIED'
    await sendTicket()
    await deliver()
    const [job] = await rows<{ last_error: string }>("SELECT last_error FROM core_jobs WHERE name = 'notify.send-ticket'")
    expect(job!.last_error).toMatch(/^core\.notifications\.domain-unverified/)
  })
})

describe('the sending domain and senders (C-32)', () => {
  it('verifies the domain with a test message to the contact address, and only then sends', async () => {
    await setSettings({ 'core.notifications.sending-domain': 'mail.example.org' })
    const noContact = await call(handle, 'POST', '/api/core/notifications/verify-domain', { actor: admin(), body: {} })
    expect(noContact.status).toBe(409)
    expect((await noContact.json()).code).toBe('core.notifications.no-contact')

    await setSettings({ 'core.organisation.contact-email': 'box-office@example.org' })
    failWith = 'E_SENDER_DOMAIN_NOT_AVAILABLE'
    const refused = await call(handle, 'POST', '/api/core/notifications/verify-domain', { actor: admin(), body: {} })
    expect(refused.status).toBe(409)
    expect((await refused.json()).code).toBe('core.notifications.domain-unverified')

    failWith = undefined
    const ok = await call(handle, 'POST', '/api/core/notifications/verify-domain', { actor: admin(), body: {} })
    expect(ok.status).toBe(200)
    expect(mails.map(m => m.to)).toEqual(['box-office@example.org'])
    expect(await rows("SELECT value FROM core_settings WHERE key = 'core.notifications.verified-domain'")).toEqual([{ value: '"mail.example.org"' }])
  })

  it('stops sending when the domain is changed, until the new one is verified', async () => {
    await verify()
    await setSettings({ 'core.notifications.sending-domain': 'other.example.org' })
    await sendTicket()
    expect(await deliver()).toEqual(['retrying'])
    expect(mails).toHaveLength(0)
  })

  it('needs the ability to manage senders', async () => {
    const response = await call(handle, 'POST', '/api/core/notifications/verify-domain', { actor: person([]), body: {} })
    expect(response.status).toBe(403)
  })

  it('sends a topic\'s mail from its named sender', async () => {
    await verify()
    expect((await call(handle, 'PUT', '/api/core/senders/box-office', { actor: admin(), body: { displayName: 'Box Office', localPart: 'tickets', replyTo: 'box-office@example.org' } })).status).toBe(200)
    expect((await call(handle, 'PUT', '/api/core/notifications/routing/transactional', { actor: admin(), body: { sender: 'box-office' } })).status).toBe(200)
    await sendTicket()
    await deliver()
    expect(mails[0]!.from).toEqual({ name: 'Box Office', email: 'tickets@mail.example.org' })
    expect((await call(handle, 'PUT', '/api/core/notifications/routing/no-such-topic', { actor: admin(), body: { sender: 'box-office' } })).status).toBe(404)
    expect((await call(handle, 'PUT', '/api/core/notifications/routing/transactional', { actor: admin(), body: { sender: 'nobody' } })).status).toBe(422)
  })

  it('says on the health screen whether email can be sent', async () => {
    const check = async () => inContext(async () => {
      const [found] = (await usePoint<{ check: () => Promise<{ state: string }> }>('core.health-check')).filter(c => c.id === 'core.sending-domain')
      return (await found!.value.check()).state
    })
    expect(await check()).toBe('failing')
    await setSettings({ 'core.notifications.sending-domain': 'mail.example.org' })
    expect(await check()).toBe('failing')
    await verify()
    expect(await check()).toBe('ok')
  })
})
