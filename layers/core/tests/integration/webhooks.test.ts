// Webhooks (group 6; C-49 to C-51): adding one with a safe address and declared, non-internal events;
// an event sent signed as Standard Webhooks with no personal data and nothing of the body kept; a
// Discord body; retries and the pause after failures in a row; resuming; retrying a failed delivery;
// rotating the secret; and "send a test".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import listHooks from '../../server/api/core/webhooks/index.get'
import createHook from '../../server/api/core/webhooks/index.post'
import readHook from '../../server/api/core/webhooks/[id]/index.get'
import patchHook from '../../server/api/core/webhooks/[id]/index.patch'
import hookState from '../../server/api/core/webhooks/[id]/state.post'
import rotate from '../../server/api/core/webhooks/[id]/rotate.post'
import testHook from '../../server/api/core/webhooks/[id]/test.post'
import hookLog from '../../server/api/core/webhooks/[id]/deliveries/index.get'
import retry from '../../server/api/core/webhooks/[id]/deliveries/[delivery]/retry.post'
import createSeason from '../../server/api/core/seasons/index.post'
import seasonState from '../../server/api/core/seasons/[id]/state.post'
import { changeSetting, createUnit } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { refusedAddress } from '../../server/webhooks/address'
import { retryWait, sign } from '../../server/webhooks/deliver'
import { call, deliver, env, inContext, person, rows, sent, server } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/webhooks': listHooks,
  'POST /api/core/webhooks': createHook,
  'GET /api/core/webhooks/:id': readHook,
  'PATCH /api/core/webhooks/:id': patchHook,
  'POST /api/core/webhooks/:id/state': hookState,
  'POST /api/core/webhooks/:id/rotate': rotate,
  'POST /api/core/webhooks/:id/test': testHook,
  'GET /api/core/webhooks/:id/deliveries': hookLog,
  'POST /api/core/webhooks/:id/deliveries/:delivery/retry': retry,
  'POST /api/core/seasons': createSeason,
  'POST /api/core/seasons/:id/state': seasonState,
})
const admin = person(['core.webhook.manage', 'core.season.manage'])
async function req<T = any>(method: string, path: string, body?: object, actor = admin): Promise<{ status: number, body: T }> {
  const r = await call(handle, method, path, { actor, body })
  return { status: r.status, body: await r.json() as T }
}
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})

interface Received { url: string, headers: Record<string, string>, body: string }
let received: Received[] = []
let answer: (url: string) => Response = () => new Response(null, { status: 204 })
let n = 0

async function hook(options: { format?: 'json' | 'discord' | 'slack', events?: string[], url?: string } = {}): Promise<{ id: string, secret: string | null }> {
  const { status, body } = await req('POST', '/api/core/webhooks', { name: `Hook ${++n}`, url: options.url ?? `https://hooks.example.org/in/${n}`, format: options.format ?? 'json', events: options.events ?? ['core.season.published'] })
  expect(status, JSON.stringify(body)).toBe(200)
  return body
}
async function publishSeason(): Promise<string> {
  const { body } = await req('POST', '/api/core/seasons', { name: `Season ${++n}`, startsOn: '2030-01-01', endsOn: '2030-12-31' })
  expect((await req('POST', `/api/core/seasons/${body.id}/state`, { to: 'published' })).status).toBe(200)
  return body.id
}
/** Lets the waits pass: sends the retries the queue is holding back, until none are left. */
async function sendRetries(): Promise<void> {
  for (;;) {
    const waiting = await rows<{ id: string }>("SELECT id FROM core_jobs WHERE name = 'core.send-webhook' AND state = 'queued'")
    if (!waiting.length) return
    await env.DB.prepare("UPDATE core_jobs SET run_after = 0 WHERE name = 'core.send-webhook' AND state = 'queued'").run()
    sent.push(...waiting.map(w => ({ jobId: w.id, lane: 'bulk' as const })))
    await deliver()
  }
}
const deliveriesOf = (webhookId: string) => rows<{ id: string, state: string, attempts: number, response_status: number | null, last_error: string | null }>('SELECT id, state, attempts, response_status, last_error FROM core_webhook_deliveries WHERE webhook_id = ? ORDER BY created_at', webhookId)

beforeEach(async () => {
  resetRateLimits()
  received = []
  answer = () => new Response(null, { status: 204 })
  sent.length = 0
  await env.DB.prepare('DELETE FROM core_webhooks').run()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    received.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body ?? '') })
    return answer(url)
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await env.DB.prepare("DELETE FROM core_settings WHERE key LIKE 'core.webhooks.%'").run()
})

describe('adding a webhook (C-49)', () => {
  it('refuses an address that is not HTTPS or is on a private or local network', () => {
    expect(refusedAddress('http://hooks.example.org/x')).toBe('not-https')
    expect(refusedAddress('not an address')).toBe('not-a-url')
    expect(refusedAddress('https://user:pass@hooks.example.org/')).toBe('credentials')
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', '[fd00::1]', '[::ffff:10.0.0.1]', 'printer.local', 'intranet', 'db.internal'])
      expect(refusedAddress(`https://${host}/hook`), host).toBe('private')
    for (const host of ['hooks.example.org', 'discord.com', '8.8.8.8', '172.32.0.1'])
      expect(refusedAddress(`https://${host}/hook`), host).toBeNull()
  })

  it('takes declared, non-internal events or a module\'s "<module>.*", shows the secret once and the address never', async () => {
    expect((await req('POST', '/api/core/webhooks', { name: 'Plain', url: 'http://hooks.example.org/', format: 'json', events: ['core.season.published'] })).status).toBe(422)
    const internal = await req('POST', '/api/core/webhooks', { name: 'Internal', url: 'https://hooks.example.org/', format: 'json', events: ['core.file.ready'] })
    expect(internal.status).toBe(422)
    expect((await req('POST', '/api/core/webhooks', { name: 'Unknown', url: 'https://hooks.example.org/', format: 'json', events: ['core.nothing.happened'] })).status).toBe(422)

    const made = await hook({ events: ['core.*', 'core.season.published'] })
    expect(made.secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    const { body } = await req('GET', `/api/core/webhooks/${made.id}`)
    expect(body.webhook).toMatchObject({ format: 'json', host: 'hooks.example.org', events: ['core.*', 'core.season.published'], state: 'active' })
    expect(JSON.stringify(body)).not.toContain(made.secret)
    expect(JSON.stringify(body)).not.toContain('/in/')
    // The offered events are exactly the ones not marked internal.
    const names = body.events.map((e: { name: string }) => e.name)
    expect(names).toContain('core.season.published')
    expect(names).not.toContain('core.file.ready')
    expect(names).not.toContain('core.webhook.paused')
    // Sealed at rest.
    const [row] = await rows<{ url: string, secret: string }>('SELECT url, secret FROM core_webhooks WHERE id = ?', made.id)
    expect(row!.url).not.toContain('hooks.example.org')
    expect(row!.secret).not.toBe(made.secret)
    expect((await req('GET', '/api/core/webhooks', undefined, person(['core.season.manage']))).status).toBe(403)
  })
})

describe('sending (C-50)', () => {
  it('sends an event signed as Standard Webhooks, with the record\'s public title and no body kept', async () => {
    const made = await hook()
    const seasonId = await publishSeason()
    await deliver()
    expect(received).toHaveLength(1)
    const [r] = received
    expect(r!.url).toBe(`https://hooks.example.org/in/${n - 1}`)
    const body = JSON.parse(r!.body)
    expect(body).toMatchObject({ event: 'core.season.published', version: 1, record: { type: 'core.season', id: seasonId, title: `Season ${n}` }, data: { seasonId } })
    expect(body.id).toBe(r!.headers['webhook-id'])
    expect(r!.headers['webhook-signature']).toBe(await sign(made.secret!, body.id, Number(r!.headers['webhook-timestamp']), r!.body))
    const [delivery] = await deliveriesOf(made.id)
    expect(delivery).toMatchObject({ id: body.id, state: 'sent', attempts: 1, response_status: 204 })
    const [hookRow] = await rows<{ last_success_at: number | null }>('SELECT last_success_at FROM core_webhooks WHERE id = ?', made.id)
    expect(hookRow!.last_success_at).not.toBeNull()
    // The log keeps what happened, not what was said.
    expect(Object.keys((await rows('SELECT * FROM core_webhook_deliveries WHERE webhook_id = ?', made.id))[0]!)).not.toContain('body')
  })

  it('sends one line to Discord, with mentions switched off and no signature', async () => {
    await hook({ format: 'discord', url: 'https://discord.com/api/webhooks/1/abc' })
    await publishSeason()
    await deliver()
    expect(JSON.parse(received[0]!.body)).toEqual({ content: `core.season.published · Season ${n}`, allowed_mentions: { parse: [] } })
    expect(received[0]!.headers['webhook-signature']).toBeUndefined()
  })

  it('sends nothing to a webhook that does not name the event, or is paused', async () => {
    await hook({ events: ['core.production.published'] })
    const paused = await hook()
    expect((await req('POST', `/api/core/webhooks/${paused.id}/state`, { paused: true })).status).toBe(200)
    await publishSeason()
    await deliver()
    expect(received).toHaveLength(0)
  })
})

describe('failures (C-51)', () => {
  it('retries a failure that may pass with growing waits, and fails at once on one that will not', async () => {
    expect([1, 2, 3].map(retryWait)).toEqual([60, 240, 960])
    await setting('core.webhooks.max-attempts', 3)
    const busy = await hook()
    answer = () => new Response('busy', { status: 503 })
    await publishSeason()
    await deliver()
    expect(await deliveriesOf(busy.id)).toMatchObject([{ state: 'retrying', attempts: 1 }])
    await sendRetries()
    expect(await deliveriesOf(busy.id)).toMatchObject([{ state: 'failed', attempts: 3, response_status: 503, last_error: 'status' }])

    await env.DB.prepare('DELETE FROM core_webhooks').run()
    const gone = await hook()
    answer = () => new Response(null, { status: 410 })
    await publishSeason()
    await deliver()
    expect(await deliveriesOf(gone.id)).toMatchObject([{ state: 'failed', attempts: 1, response_status: 410 }])
  })

  it('pauses a webhook after the set failures in a row, says so, and sends what waited once resumed', async () => {
    await setting('core.webhooks.max-attempts', 1)
    await setting('core.webhooks.pause-after', 5)
    const made = await hook()
    answer = () => new Response(null, { status: 500 })
    for (let i = 0; i < 5; i++) await publishSeason()
    await deliver()
    const [state] = await rows<{ state: string, consecutive_failures: number }>('SELECT state, consecutive_failures FROM core_webhooks WHERE id = ?', made.id)
    expect(state).toMatchObject({ state: 'failing', consecutive_failures: 5 })
    expect(await rows('SELECT 1 FROM core_events WHERE name = \'core.webhook.paused\' AND payload LIKE ?', `%${made.id}%`)).toHaveLength(1)

    // Paused, nothing more is queued; resumed, the run of failures starts again.
    received = []
    await publishSeason()
    await deliver()
    expect(received).toHaveLength(0)
    answer = () => new Response(null, { status: 204 })
    expect((await req('POST', `/api/core/webhooks/${made.id}/state`, { paused: false })).status).toBe(200)
    const [resumed] = await rows<{ state: string, consecutive_failures: number }>('SELECT state, consecutive_failures FROM core_webhooks WHERE id = ?', made.id)
    expect(resumed).toMatchObject({ state: 'active', consecutive_failures: 0 })
  })

  it('tries a failed delivery again on request, and lists the log newest first', async () => {
    await setting('core.webhooks.max-attempts', 1)
    const made = await hook()
    answer = () => new Response(null, { status: 500 })
    await publishSeason()
    await deliver()
    const [failed] = await deliveriesOf(made.id)
    expect(failed!.state).toBe('failed')
    answer = () => new Response(null, { status: 200 })
    expect((await req('POST', `/api/core/webhooks/${made.id}/deliveries/${failed!.id}/retry`, {})).status).toBe(200)
    await deliver()
    expect((await deliveriesOf(made.id))[0]).toMatchObject({ state: 'sent', attempts: 1, response_status: 200 })
    expect((await req('POST', `/api/core/webhooks/${made.id}/deliveries/${failed!.id}/retry`, {})).status).toBe(409)
    const log = (await req('GET', `/api/core/webhooks/${made.id}/deliveries`)).body
    expect(log).toMatchObject({ total: 1, rows: [{ id: failed!.id, eventName: 'core.season.published', state: 'sent' }] })
  })
})

describe('the secret and the test', () => {
  it('rotates the secret, which signs from then on', async () => {
    const made = await hook()
    const { body } = await req('POST', `/api/core/webhooks/${made.id}/rotate`, {})
    expect(body.secret).toMatch(/^whsec_/)
    expect(body.secret).not.toBe(made.secret)
    await publishSeason()
    await deliver()
    const r = received[0]!
    expect(r.headers['webhook-signature']).toBe(await sign(body.secret, r.headers['webhook-id']!, Number(r.headers['webhook-timestamp']), r.body))
  })

  it('sends a marked test now, logs nothing, and answers with the receiver\'s status', async () => {
    const made = await hook()
    answer = () => new Response(null, { status: 418 })
    const { body } = await req('POST', `/api/core/webhooks/${made.id}/test`, {})
    expect(body).toMatchObject({ ok: false, status: 418 })
    expect(JSON.parse(received[0]!.body)).toMatchObject({ event: 'core.webhook.test', test: true })
    expect(await deliveriesOf(made.id)).toHaveLength(0)
  })

  it('makes a secret when a webhook becomes JSON, and drops it when it stops being', async () => {
    const made = await hook({ format: 'slack' })
    expect(made.secret).toBeNull()
    const toJson = await req('PATCH', `/api/core/webhooks/${made.id}`, { format: 'json' })
    expect(toJson.body.secret).toMatch(/^whsec_/)
    await req('PATCH', `/api/core/webhooks/${made.id}`, { format: 'discord' })
    expect((await rows<{ secret: string | null }>('SELECT secret FROM core_webhooks WHERE id = ?', made.id))[0]!.secret).toBeNull()
  })
})
