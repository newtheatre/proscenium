// C-29 (account-targeted notify): one notification per account and one delivery per channel,
// written set-wise in the caller's unit; email sent by a job after the commit, the inbox written at
// once; dedupe, preferences, the suppression list and a module that is off; retries and failure.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, isRefusal, newId, setClock } from '#kit'
import { runJob } from '#kit/jobs'
import { MailError, setMailer, type OutgoingEmail } from '../../server/notifications/mailer'
import { notify } from '../../server/services'
import { addressHash } from '../../server/notifications/suppression'
import { emailEventsConsumer } from '../../server/email-events'
import sweep from '../../server/tasks/sweep-notifications'
import { env, inContext, rows, sent, setModule } from '../../../../tests/integration/helpers'

const mails: (OutgoingEmail & { messageId: string })[] = []
let failWith: { code: string, retryable: boolean } | undefined

async function setSetting(key: string, value: unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, value === null ? { reset: true } : {})
    await unit.commit()
  })
}

/** An account with an audience address, claimed and verified or unclaimed. */
async function account(address = `p${Math.random().toString(36).slice(2, 10)}@example.org`, options: { members?: string, locale?: string } = {}): Promise<string> {
  const id = newId('acc')
  const emailId = newId('aem')
  const statements = [
    env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, audience_email_id, locale) VALUES (?, \'Pat\', \'guest\', ?, ?, ?)').bind(id, Date.now(), emailId, options.locale ?? null),
    env.DB.prepare('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, NULL, \'checkout\', ?)').bind(emailId, id, address, Date.now()),
  ]
  await env.DB.batch(statements)
  return id
}

async function noAddress(): Promise<string> {
  const id = newId('acc')
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at) VALUES (?, \'Nobody\', \'guest\', ?)').bind(id, Date.now()).run()
  return id
}

async function send(typeKey: string, options: Parameters<typeof notify>[2]) {
  return inContext(async () => {
    const unit = createUnit()
    const ids = await notify(unit.view(), typeKey, options)
    const result = await unit.commit()
    return { ids, statements: result.results.length }
  })
}

/** Runs the queued jobs once each. */
async function deliver(): Promise<string[]> {
  const batch = sent.splice(0)
  const outcomes: string[] = []
  for (const message of batch) outcomes.push(await inContext(() => runJob(message.jobId), { kind: 'job' }))
  return outcomes
}

async function deliveriesOf(notificationIds: string[]) {
  return rows<{ notification_id: string, channel: string, state: string, reason: string | null, attempts: number, provider_ref: string | null, last_error: string | null }>(
    'SELECT notification_id, channel, state, reason, attempts, provider_ref, last_error FROM core_notification_deliveries WHERE notification_id IN (SELECT value FROM json_each(?)) ORDER BY channel', JSON.stringify(notificationIds))
}

beforeAll(async () => {
  for (const [key, value] of Object.entries({ 'core.notifications.sending-domain': 'mail.example.org', 'core.notifications.verified-domain': 'mail.example.org', 'core.site.name': 'The Test Theatre' }))
    await setSetting(key, value)
})

beforeEach(() => {
  mails.length = 0
  sent.length = 0
  failWith = undefined
  setMailer(async (email) => {
    if (failWith) throw new MailError(failWith.code, failWith.retryable)
    const messageId = `<${newId('msg')}@mail.example.org>`
    mails.push({ ...email, messageId })
    return { messageId }
  })
})

afterEach(() => setMailer())

describe('notify', () => {
  it('records a notification and its deliveries in the caller\'s unit, then sends the email from a job', async () => {
    const to = await account('reader@example.org')
    const { ids } = await send('notify.receipt', { to, variables: { order: 'A12' }, subject: ['seats.performance', 'sp_x'] })
    expect(ids).toHaveLength(1)
    const [row] = await rows<Record<string, unknown>>('SELECT type_key, side, account_id, locale, subject_type, subject_id, payload FROM core_notifications WHERE id = ?', ids[0])
    expect(row).toMatchObject({ type_key: 'notify.receipt', side: 'audience', account_id: to, locale: 'en-GB', subject_type: 'seats.performance', subject_id: 'sp_x' })
    expect(JSON.parse(row!.payload as string)).toEqual({ order: 'A12' })

    expect(await deliveriesOf(ids)).toMatchObject([{ channel: 'email', state: 'queued' }, { channel: 'inbox', state: 'sent' }])
    const [inbox] = await rows<Record<string, unknown>>('SELECT account_id, side, title, body, link, read_at FROM core_inbox_items WHERE account_id = ?', to)
    expect(inbox).toMatchObject({ side: 'audience', title: 'Your order A12', link: '/account/orders/A12', read_at: null })
    expect(inbox!.body).toContain('Thank you for order A12.')
    expect(mails).toHaveLength(0)

    expect(await deliver()).toEqual(['done'])
    expect(mails).toHaveLength(1)
    expect(mails[0]).toMatchObject({ to: 'reader@example.org', subject: 'Your order A12' })
    const [email] = await deliveriesOf(ids)
    expect(email).toMatchObject({ state: 'sent', attempts: 1, provider_ref: mails[0]!.messageId })
    expect((await rows<{ payload: string | null }>('SELECT payload FROM core_notifications WHERE id = ?', ids[0]))[0]!.payload).toBeNull()
  })

  it('keeps a sealed variable encrypted in its own column, sends it by email only and clears it once sent', async () => {
    const to = await account('invitee@example.org')
    const link = 'https://theatre.example.org/invite#k3y-that-signs-in'
    const { ids } = await send('notify.invite', { to, variables: { link } })
    const [row] = await rows<{ payload: string, sealed_variables: string }>('SELECT payload, sealed_variables FROM core_notifications WHERE id = ?', ids[0])
    expect(JSON.parse(row!.payload)).toEqual({})
    expect(row!.sealed_variables).toMatch(/^v1\./)
    expect(row!.sealed_variables).not.toContain('k3y-that-signs-in')
    expect(await deliveriesOf(ids)).toMatchObject([{ channel: 'email', state: 'queued' }])
    expect(await rows('SELECT id FROM core_inbox_items WHERE account_id = ?', to)).toHaveLength(0)
    await deliver()
    expect(mails[0]!.text).toContain(link)
    expect((await rows<{ payload: string | null, sealed_variables: string | null }>('SELECT payload, sealed_variables FROM core_notifications WHERE id = ?', ids[0]))[0]).toEqual({ payload: null, sealed_variables: null })
  })

  it('clears a sealed variable when the email fails for good, and will not send a cleared one', async () => {
    const to = await account()
    failWith = { code: 'E_RECIPIENT_NOT_ALLOWED', retryable: false }
    const { ids } = await send('notify.invite', { to, variables: { link: 'https://theatre.example.org/invite#once' } })
    await deliver()
    expect(await deliveriesOf(ids)).toMatchObject([{ state: 'failed' }])
    expect((await rows<{ sealed_variables: string | null }>('SELECT sealed_variables FROM core_notifications WHERE id = ?', ids[0]))[0]!.sealed_variables).toBeNull()

    failWith = undefined
    const again = await send('notify.invite', { to, variables: { link: 'https://theatre.example.org/invite#twice' } })
    await env.DB.prepare('UPDATE core_notifications SET sealed_variables = NULL WHERE id = ?').bind(again.ids[0]).run()
    await deliver()
    expect(mails).toHaveLength(0)
    expect(await deliveriesOf(again.ids)).toMatchObject([{ state: 'skipped', reason: 'erased' }])
  })

  it('writes fifty recipients in a handful of statements, and nothing at all when repeated with the same keys', async () => {
    const accounts = await Promise.all(Array.from({ length: 50 }, () => account()))
    const first = await send('notify.receipt', { to: accounts.map(accountId => ({ accountId, variables: { order: accountId.slice(-4) } })), dedupeKey: 'order-1' })
    expect(first.ids).toHaveLength(50)
    expect(new Set(first.ids).size).toBe(50)
    expect(first.statements).toBeLessThanOrEqual(5)
    const counted = async () => (await rows<{ n: number }>('SELECT count(*) AS n FROM core_notifications WHERE account_id IN (SELECT value FROM json_each(?))', JSON.stringify(accounts)))[0]!.n
    expect(await counted()).toBe(50)

    sent.length = 0
    const again = await send('notify.receipt', { to: accounts, variables: { order: 'x' }, dedupeKey: 'order-1' })
    expect(again.ids).toEqual(first.ids)
    expect(again.statements).toBe(0)
    expect(sent).toHaveLength(0)
    expect(await counted()).toBe(50)
  })

  it('leaves nothing behind when the caller\'s unit fails', async () => {
    const to = await account()
    const outcome = await inContext(async () => {
      const unit = createUnit()
      await notify(unit.view(), 'notify.receipt', { to, variables: { order: 'B1' } })
      unit.add({ sql: 'UPDATE seats_performances SET sold = sold WHERE id = ?', params: ['sp_none'] }).expect(1, { code: 'test.gone', reason: 'gone' })
      return unit.commit().then(() => 'saved', e => (isRefusal(e) ? e.code : 'other'))
    })
    expect(outcome).toBe('test.gone')
    expect(await rows('SELECT id FROM core_notifications WHERE account_id = ?', to)).toEqual([])
    expect(await rows('SELECT id FROM core_inbox_items WHERE account_id = ?', to)).toEqual([])
  })

  it('refuses a set over the kit\'s limit before writing anything', async () => {
    await setSetting('core.units.set-rows-limit', 10)
    try {
      const accounts = await Promise.all(Array.from({ length: 11 }, () => account()))
      const outcome = await send('notify.receipt', { to: accounts, variables: { order: 'C1' } }).then(() => 'saved', e => (isRefusal(e) ? e.code : String(e)))
      expect(outcome).toBe('core.unit.too-large')
      expect(await rows('SELECT id FROM core_notifications WHERE account_id IN (SELECT value FROM json_each(?))', JSON.stringify(accounts))).toEqual([])
    }
    finally {
      await setSetting('core.units.set-rows-limit', null)
    }
  })

  it('skips an account with no address and an address on the suppression list, saying why', async () => {
    const nobody = await noAddress()
    const bounced = await account('bounced@example.org')
    await env.DB.prepare('INSERT INTO core_email_suppressions (address_hash, reason, created_at) VALUES (?, \'hard_bounce\', ?)').bind(await inContext(() => addressHash('Bounced@Example.org')), Date.now()).run()
    const { ids } = await send('notify.receipt', { to: [nobody, bounced], variables: { order: 'D1' } })
    const states = await deliveriesOf(ids)
    expect(states.filter(d => d.channel === 'email').map(d => [d.notification_id, d.state, d.reason])).toEqual(expect.arrayContaining([[ids[0], 'skipped', 'no_address'], [ids[1], 'skipped', 'suppressed_address']]))
    expect(states.filter(d => d.channel === 'inbox').every(d => d.state === 'sent')).toBe(true)
    expect(sent).toHaveLength(0)
  })

  it('honours a person\'s choice for an optional topic, on each channel', async () => {
    const quiet = await account()
    const keen = await account()
    await env.DB.prepare('INSERT INTO core_notification_preferences (account_id, topic_key, channel, side, enabled) VALUES (?, \'notify.rota\', \'email\', \'members\', 0)').bind(quiet).run()
    const { ids } = await send('notify.rota-reminder', { to: [quiet, keen], variables: { shift: 'Saturday matinée' } })
    const states = await deliveriesOf(ids)
    const of = (id: string, channel: string) => states.find(d => d.notification_id === id && d.channel === channel)
    expect(of(ids[0]!, 'email')).toMatchObject({ state: 'suppressed', reason: 'preference' })
    expect(of(ids[0]!, 'inbox')).toMatchObject({ state: 'sent' })
    expect(of(ids[1]!, 'email')).toMatchObject({ state: 'queued' })
    expect(sent.map(m => m.lane)).toEqual(['bulk'])
  })

  it('records a message of a module that is off as skipped, and sends nothing', async () => {
    const to = await account()
    await setModule('notify', false)
    try {
      const { ids } = await send('notify.receipt', { to, variables: { order: 'E1' } })
      expect((await deliveriesOf(ids)).map(d => [d.state, d.reason])).toEqual([['skipped', 'module_off'], ['skipped', 'module_off']])
      expect(await rows('SELECT id FROM core_inbox_items WHERE account_id = ?', to)).toEqual([])
    }
    finally {
      await setModule('notify', true)
    }
  })

  it('refuses variables the type does not declare, naming the variable and not its value', async () => {
    const to = await account()
    const outcome = await send('notify.receipt', { to, variables: { order: 'F1', secret: 'x' } }).then(() => null, e => e)
    expect(isRefusal(outcome)).toBe(true)
    expect(outcome.fields).toEqual({ secret: 'is not declared by this type' })
  })
})

describe('sending', () => {
  it('retries a failure that may pass, waiting longer each time, and fails for good after the last try', async () => {
    await setSetting('core.notifications.max-attempts', 2)
    try {
      const to = await account()
      const { ids } = await send('notify.receipt', { to, variables: { order: 'G1' } })
      failWith = { code: 'E_INTERNAL_SERVER_ERROR', retryable: true }
      await deliver()
      let [email] = await deliveriesOf(ids)
      expect(email).toMatchObject({ state: 'retrying', attempts: 1, last_error: 'E_INTERNAL_SERVER_ERROR' })
      expect(sent).toHaveLength(1)
      expect(sent[0]!.delaySeconds).toBe(120)

      setClock(Date.now() + 121_000) // not-policy: past the first retry's wait
      await deliver()
      ;[email] = await deliveriesOf(ids)
      expect(email).toMatchObject({ state: 'failed', attempts: 2 })
      const [event] = await rows<{ payload: string }>("SELECT payload FROM core_events WHERE name = 'core.delivery.failed' ORDER BY announced_at DESC LIMIT 1")
      expect(JSON.parse(event!.payload)).toEqual({ notificationId: ids[0], typeKey: 'notify.receipt', channel: 'email' })
    }
    finally {
      setClock(undefined)
      await setSetting('core.notifications.max-attempts', null)
    }
  })

  it('fails at once when the provider says the recipient is suppressed', async () => {
    const to = await account()
    const { ids } = await send('notify.receipt', { to, variables: { order: 'H1' } })
    failWith = { code: 'E_RECIPIENT_SUPPRESSED', retryable: false }
    await deliver()
    expect((await deliveriesOf(ids))[0]).toMatchObject({ state: 'failed', reason: 'suppressed_address', last_error: 'E_RECIPIENT_SUPPRESSED' })
    expect(sent).toHaveLength(0)
  })

  it('sends a delivery once, however many copies of the job run', async () => {
    const to = await account()
    await send('notify.receipt', { to, variables: { order: 'J1' } })
    const message = sent.splice(0)[0]!
    await Promise.all([inContext(() => runJob(message.jobId), { kind: 'job' }), inContext(() => runJob(message.jobId), { kind: 'job' })])
    expect(mails.filter(m => m.subject === 'Your order J1')).toHaveLength(1)
  })
})

/** Hands one Email Sending outcome to core's consumer, as the kit does, and commits on 'done'. */
async function outcome(type: string, messageId: string, extra: Record<string, unknown> = {}, attempts = 1) {
  return inContext(async () => {
    const unit = createUnit()
    const answer = await emailEventsConsumer({ type: `cf.email.sending.message.${type}`, payload: { messageId, ...extra } }, unit.view(), { id: 'q1', attempts })
    if (answer === 'done') await unit.commit()
    return answer
  }, { kind: 'job' })
}

async function sentTo(address: string, order: string) {
  const to = await account(address)
  const { ids } = await send('notify.receipt', { to, variables: { order } })
  await deliver()
  const [email] = await deliveriesOf(ids)
  return { to, id: ids[0]!, messageId: email!.provider_ref! }
}

async function suppressed(address: string) {
  return (await rows<{ reason: string, lifted_at: number | null }>('SELECT reason, lifted_at FROM core_email_suppressions WHERE address_hash = ?', await inContext(() => addressHash(address))))[0]
}

describe('what Cloudflare reports afterwards', () => {
  it('records a hard bounce on the delivery it names, suppresses the address and stops the next send', async () => {
    const first = await sentTo('gone@example.org', 'K1')
    expect(await outcome('bounced', first.messageId, { recipient: 'gone@example.org', bounce: { type: 'hard', classification: 'permanent_failure' } })).toBe('done')
    expect((await deliveriesOf([first.id]))[0]).toMatchObject({ state: 'bounced', reason: 'suppressed_address' })
    expect(await suppressed('gone@example.org')).toMatchObject({ reason: 'hard_bounce', lifted_at: null })
    const [event] = await rows<{ payload: string }>("SELECT payload FROM core_events WHERE name = 'core.delivery.bounced' ORDER BY announced_at DESC LIMIT 1")
    expect(JSON.parse(event!.payload)).toEqual({ notificationId: first.id, accountId: first.to })

    // A repeat of the report changes nothing; the next message to that address is skipped.
    expect(await outcome('bounced', first.messageId, { recipient: 'gone@example.org', bounce: { type: 'hard' } })).toBe('done')
    const { ids } = await send('notify.receipt', { to: first.to, variables: { order: 'K2' } })
    expect((await deliveriesOf(ids))[0]).toMatchObject({ state: 'skipped', reason: 'suppressed_address' })
  })

  it('records a complaint, and lets a soft bounce, a deferral or a delivery change nothing', async () => {
    const soft = await sentTo('busy@example.org', 'L1')
    for (const type of ['delivered', 'deferred']) expect(await outcome(type, soft.messageId, { recipient: 'busy@example.org' })).toBe('done')
    expect(await outcome('bounced', soft.messageId, { recipient: 'busy@example.org', bounce: { type: 'soft' } })).toBe('done')
    expect((await deliveriesOf([soft.id]))[0]!.state).toBe('sent')
    expect(await suppressed('busy@example.org')).toBeUndefined()

    const angry = await sentTo('angry@example.org', 'L2')
    expect(await outcome('complained', angry.messageId, { recipient: 'angry@example.org' })).toBe('done')
    expect((await deliveriesOf([angry.id]))[0]!.state).toBe('complained')
    expect(await suppressed('angry@example.org')).toMatchObject({ reason: 'complaint' })
  })

  it('suppresses an address whose send it never recorded, after giving the send a moment to be recorded', async () => {
    expect(await outcome('bounced', '<unknown@mail.example.org>', { recipient: 'stranger@example.org', bounce: { type: 'hard' } }, 1)).toBe('not-yet')
    expect(await suppressed('stranger@example.org')).toBeUndefined()
    expect(await outcome('bounced', '<unknown@mail.example.org>', { recipient: 'stranger@example.org', bounce: { type: 'hard' } }, 3)).toBe('done')
    expect(await suppressed('stranger@example.org')).toMatchObject({ reason: 'hard_bounce' })
  })
})

describe('the sweep', () => {
  it('frees a delivery stuck in sending, queues a lost one again, and clears finished payloads', async () => {
    const to = await account()
    const { ids } = await send('notify.receipt', { to, variables: { order: 'M1' } })
    sent.length = 0 // the queue lost the message
    await env.DB.prepare('UPDATE core_notification_deliveries SET state = \'sending\', next_attempt_at = ? WHERE notification_id = ? AND channel = \'email\'').bind(Date.now() - 1000, ids[0]).run()
    await inContext(async () => {
      const unit = createUnit()
      await sweep(unit.view(), { dueAt: Date.now() })
      await unit.commit()
    }, { kind: 'job' })
    expect((await deliveriesOf(ids))[0]).toMatchObject({ state: 'retrying', last_error: 'stuck' })
    expect(sent).toHaveLength(1)
    await deliver()
    expect((await deliveriesOf(ids))[0]!.state).toBe('sent')

    await inContext(async () => {
      const unit = createUnit()
      await sweep(unit.view(), { dueAt: Date.now() })
      await unit.commit()
    }, { kind: 'job' })
    const [row] = await rows<{ payload: string | null }>('SELECT payload FROM core_notifications WHERE id = ?', ids[0])
    expect(row!.payload).toBeNull()
  })

  it('clears sealed variables left for seven days, even when the email was never sent', async () => {
    const to = await account()
    const { ids } = await send('notify.invite', { to, variables: { link: 'https://theatre.example.org/invite#stale' } })
    sent.length = 0
    await env.DB.prepare('UPDATE core_notifications SET created_at = ? WHERE id = ?').bind(Date.now() - 8 * 86_400_000, ids[0]).run()
    const fresh = await send('notify.invite', { to: await account(), variables: { link: 'https://theatre.example.org/invite#fresh' } })
    sent.length = 0
    await inContext(async () => {
      const unit = createUnit()
      await sweep(unit.view(), { dueAt: Date.now() })
      await unit.commit()
    }, { kind: 'job' })
    const sealed = async (id: string) => (await rows<{ sealed_variables: string | null }>('SELECT sealed_variables FROM core_notifications WHERE id = ?', id))[0]!.sealed_variables
    expect(await sealed(ids[0]!)).toBeNull()
    expect(await sealed(fresh.ids[0]!)).toMatch(/^v1\./)
  })
})
