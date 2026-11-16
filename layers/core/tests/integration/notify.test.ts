// C-29 (account-targeted notify): one notification per account and one delivery per channel,
// written set-wise in the caller's unit; email sent by a job after the commit, the inbox written at
// once; dedupe, preferences, the suppression list and a module that is off; retries and failure.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, isRefusal, newId, setClock } from '#kit'
import { runJob } from '#kit/jobs'
import { MailError, setMailer, type OutgoingEmail } from '../../server/notifications/mailer'
import { notify } from '../../server/services'
import { addressHash } from '../../server/notifications/suppression'
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
