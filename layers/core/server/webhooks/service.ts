// Looking after webhooks (C-49, C-51): add, edit, pause and resume, rotate the secret, delete, read
// the delivery log and retry a failed delivery. The address and the secret are sealed with the core
// key; the console sees the address's host only, and the secret once, when it is made.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, first, newId, nowMs, openColumn, refuse, sealColumn } from '#kit'
import type { UnitView } from '#kit'
import { addressHint, refusedAddress } from './address'
import { deliverableEvents, newSecret, sendTest, type PostResult, type WebhookFormat } from './deliver'

export const FORMATS = ['json', 'discord', 'slack'] as const

export const webhookInput = z.object({
  name: z.string().trim().min(1).max(60), // not-policy: the table's bounds on a name
  url: z.string().trim().min(1).max(2000), // not-policy: a sane bound on an address
  format: z.enum(FORMATS),
  events: z.array(z.string().min(1).max(120)).min(1).max(500), // not-policy: bounds on the event list
})
export const webhookPatch = webhookInput.partial()

export interface Webhook {
  id: string
  name: string
  format: WebhookFormat
  /** Where it goes: the address's host alone. */
  host: string
  events: string[]
  state: 'active' | 'paused' | 'failing'
  consecutiveFailures: number
  lastSuccessAt: number | null
  createdAt: number
}

export interface WebhookDelivery {
  id: string
  eventId: string
  eventName: string
  state: 'queued' | 'sending' | 'sent' | 'retrying' | 'failed'
  attempts: number
  nextAttemptAt: number | null
  responseStatus: number | null
  lastError: string | null
  createdAt: number
  sentAt: number | null
}

const NAME_TAKEN = { code: 'core.webhook.name-taken', reason: 'Another webhook already has this name.', remedy: 'Choose a different name.' }
const NOT_FOUND = { code: 'core.webhook.not-found', reason: 'There is no such webhook.', status: 404 } as const

const ADDRESS_REASONS = {
  'not-a-url': 'Give a full web address, starting https://.',
  'not-https': 'The address must start https://, so what is sent cannot be read on the way.',
  'credentials': 'Leave a name and password out of the address.',
  'private': 'The address is on a private or local network, which a webhook cannot reach.',
} as const

function checkAddress(url: string) {
  const refused = refusedAddress(url)
  if (refused) refuse('core.webhook.address', ADDRESS_REASONS[refused], { status: 422, fields: { url: ADDRESS_REASONS[refused] } })
}

/** Each name a declared event not marked internal, or "<module>.*" for a module that has one. */
function checkEvents(events: string[]): string[] {
  const deliverable = deliverableEvents()
  const names = new Set(deliverable.map(e => e.name))
  const modules = new Set(deliverable.map(e => e.module))
  const unknown = events.filter(e => !(names.has(e) || (e.endsWith('.*') && modules.has(e.slice(0, -2)))))
  if (unknown.length) refuse('core.webhook.events', `These cannot be sent to a webhook: ${unknown.join(', ')}.`, { status: 422, fields: { events: 'Choose events from the list.' } })
  return [...new Set(events)].sort()
}

interface Row { id: string, name: string, format: WebhookFormat, url_hint: string, events: string, state: Webhook['state'], consecutive_failures: number, last_success_at: number | null, created_at: number }
const toWebhook = (r: Row): Webhook => ({
  id: r.id, name: r.name, format: r.format, host: r.url_hint, events: JSON.parse(r.events) as string[], state: r.state,
  consecutiveFailures: r.consecutive_failures, lastSuccessAt: r.last_success_at, createdAt: r.created_at,
})
const SELECT = 'SELECT id, name, format, url_hint, events, state, consecutive_failures, last_success_at, created_at FROM core_webhooks'

export async function listWebhooks(): Promise<Webhook[]> {
  return (await all<Row>(`${SELECT} ORDER BY lower(name)`)).map(toWebhook)
}

export async function getWebhook(id: string): Promise<Webhook> {
  const row = await first<Row>(`${SELECT} WHERE id = ?`, id)
  return row ? toWebhook(row) : refuse(NOT_FOUND.code, NOT_FOUND.reason, { status: NOT_FOUND.status })
}

/** The audit keeps named events and whole modules ("core.*") apart, since a detail holds codes alone. */
function eventDetail(events: string[]): { events: string[], modules: string[] } {
  return { events: events.filter(e => !e.endsWith('.*')), modules: events.filter(e => e.endsWith('.*')).map(e => e.slice(0, -2)) }
}

/** Adds a webhook. For JSON it answers with the secret, the one time it is ever shown. */
export async function createWebhook(unit: UnitView, input: z.infer<typeof webhookInput>, actorId: string | null): Promise<{ id: string, secret: string | null }> {
  checkAddress(input.url)
  const events = checkEvents(input.events)
  const id = newId('whk')
  const secret = input.format === 'json' ? newSecret() : null
  const at = nowMs()
  unit.add(sql`INSERT INTO core_webhooks (id, name, format, url, url_hint, secret, events, state, consecutive_failures, created_by, created_at, updated_at)
    SELECT ${id}, ${input.name}, ${input.format}, ${await sealColumn(input.url)}, ${addressHint(input.url)}, ${await sealColumn(secret)}, ${JSON.stringify(events)}, 'active', 0, ${actorId}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM core_webhooks WHERE lower(name) = lower(${input.name}))`).expect(1, NAME_TAKEN)
  unit.audit({ action: 'create', record: ['core.webhook', id], detail: { format: input.format, host: addressHint(input.url), ...eventDetail(events) } })
  return { id, secret }
}

/**
 * Changes a webhook. A new address replaces the old; the secret stays unless the format moves to or
 * from JSON, when one is made (answered, shown once) or dropped.
 */
export async function updateWebhook(unit: UnitView, id: string, input: z.infer<typeof webhookPatch>): Promise<{ secret: string | null }> {
  const current = await getWebhook(id)
  if (input.url !== undefined) checkAddress(input.url)
  const events = input.events ? checkEvents(input.events) : current.events
  const format = input.format ?? current.format
  const secret = format === 'json' && current.format !== 'json' ? newSecret() : null
  const dropSecret = format !== 'json'
  unit.add(sql`UPDATE core_webhooks SET name = ${input.name ?? current.name}, format = ${format}, events = ${JSON.stringify(events)},
      url = ${input.url !== undefined ? await sealColumn(input.url) : sql`url`}, url_hint = ${input.url !== undefined ? addressHint(input.url) : current.host},
      secret = ${secret ? await sealColumn(secret) : dropSecret ? null : sql`secret`}, updated_at = ${nowMs()}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM core_webhooks WHERE lower(name) = lower(${input.name ?? current.name}) AND id != ${id})`).expect(1, NAME_TAKEN)
  unit.audit({ action: 'update', record: ['core.webhook', id], detail: { format, ...eventDetail(events), ...(input.url !== undefined ? { host: addressHint(input.url) } : {}) } })
  return { secret }
}

/** A new secret for a JSON webhook, answered once; the old one stops working at once. */
export async function rotateSecret(unit: UnitView, id: string): Promise<{ secret: string }> {
  const current = await getWebhook(id)
  if (current.format !== 'json') refuse('core.webhook.no-secret', 'Only a signed JSON webhook has a secret.', { status: 422 })
  const secret = newSecret()
  unit.add(sql`UPDATE core_webhooks SET secret = ${await sealColumn(secret)}, updated_at = ${nowMs()} WHERE id = ${id}`).expect(1, { code: NOT_FOUND.code, reason: NOT_FOUND.reason })
  unit.audit({ action: 'update', record: ['core.webhook', id], detail: { rotated: true } })
  return { secret }
}

/**
 * Pauses or resumes. Resuming clears the run of failures and sends what waited meanwhile, oldest
 * first, as the sweep would; a paused webhook queues nothing new.
 */
export async function setWebhookPaused(unit: UnitView, id: string, paused: boolean): Promise<void> {
  const current = await getWebhook(id)
  if (paused ? current.state === 'paused' : current.state === 'active') return
  unit.add(sql`UPDATE core_webhooks SET state = ${paused ? 'paused' : 'active'}, consecutive_failures = ${paused ? sql`consecutive_failures` : 0}, updated_at = ${nowMs()} WHERE id = ${id}`).expect(1, { code: NOT_FOUND.code, reason: NOT_FOUND.reason })
  unit.audit({ action: 'state', record: ['core.webhook', id], detail: { paused } })
  if (!paused) {
    const waiting = await all<{ id: string }>('SELECT id FROM core_webhook_deliveries WHERE webhook_id = ? AND state IN (\'queued\', \'retrying\') ORDER BY created_at LIMIT 500', id) // not-policy: one batch
    if (waiting.length) unit.enqueue('core.send-webhook', { deliveryIds: waiting.map(r => r.id) })
  }
}

export async function deleteWebhook(unit: UnitView, id: string): Promise<void> {
  await getWebhook(id)
  unit.add(sql`DELETE FROM core_webhooks WHERE id = ${id}`).expect(1, { code: NOT_FOUND.code, reason: NOT_FOUND.reason })
  unit.audit({ action: 'delete', record: ['core.webhook', id] })
}

/** The delivery log for one webhook, newest first. */
export async function webhookDeliveries(id: string, options: { page?: number, size?: number } = {}): Promise<{ rows: WebhookDelivery[], total: number }> {
  await getWebhook(id)
  const size = options.size ?? 50 // not-policy: a page of the log
  const page = Math.max(1, options.page ?? 1)
  const rows = await all<{ id: string, event_id: string, event_name: string, state: WebhookDelivery['state'], attempts: number, next_attempt_at: number | null, response_status: number | null, last_error: string | null, created_at: number, sent_at: number | null }>(
    'SELECT id, event_id, event_name, state, attempts, next_attempt_at, response_status, last_error, created_at, sent_at FROM core_webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    id, size, (page - 1) * size,
  )
  const total = (await first<{ n: number }>('SELECT count(*) AS n FROM core_webhook_deliveries WHERE webhook_id = ?', id))?.n ?? 0
  return {
    rows: rows.map(r => ({ id: r.id, eventId: r.event_id, eventName: r.event_name, state: r.state, attempts: r.attempts, nextAttemptAt: r.next_attempt_at, responseStatus: r.response_status, lastError: r.last_error, createdAt: r.created_at, sentAt: r.sent_at })),
    total,
  }
}

/** Tries a failed delivery again, from its first attempt. */
export async function retryDelivery(unit: UnitView, webhookId: string, deliveryId: string): Promise<void> {
  unit.add(sql`UPDATE core_webhook_deliveries SET state = 'queued', attempts = 0, next_attempt_at = NULL, last_error = NULL WHERE id = ${deliveryId} AND webhook_id = ${webhookId} AND state = 'failed'`)
    .expect(1, { code: 'core.webhook.not-failed', reason: 'Only a failed delivery can be tried again.' })
  unit.audit({ action: 'update', record: ['core.webhook', webhookId], detail: { retried: deliveryId } })
  unit.enqueue('core.send-webhook', { deliveryIds: [deliveryId] })
}

/** Sends a marked test to the webhook as saved, and answers with what the receiver said. */
export async function testWebhook(id: string): Promise<PostResult> {
  await getWebhook(id)
  const row = (await first<{ format: WebhookFormat, url: string, secret: string | null }>('SELECT format, url, secret FROM core_webhooks WHERE id = ?', id))!
  return sendTest({ format: row.format, url: (await openColumn(row.url))!, secret: await openColumn(row.secret) })
}
