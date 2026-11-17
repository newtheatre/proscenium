// Sending the theatre's events to webhooks (group 6; C-50, C-51). The deliverable listener queues one
// delivery for each active webhook subscribed to an event; the send job claims each, rebuilds its body
// from the event, signs it and posts it. The body holds the event's name and time, its ids and the
// record's public title, never personal data: it is built from the event's payload, which carries ids
// and times only, and nothing of it is kept in the log.
//
// Signing follows Standard Webhooks (standardwebhooks.com), so a receiver can check a delivery with an
// off-the-shelf library: the headers webhook-id, webhook-timestamp and webhook-signature, the last
// being "v1," and the base64 HMAC-SHA256 of "<id>.<timestamp>.<body>" under the secret.
import { all, createUnit, first, isRefusal, newId, nowMs, openColumn, siteUrl, useSetting } from '#kit'
import type { UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { notify } from '../notifications/notify'
import { holdersOf } from '../identity/holders'

export type WebhookFormat = 'json' | 'discord' | 'slack'

/** The events a webhook may name: every declared event not marked internal. */
export function deliverableEvents(): { name: string, module: string, version: number }[] {
  return [...useRegistry().events].filter(([, e]) => !e.decl.internal).map(([name, e]) => ({ name, module: e.module, version: e.decl.version })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Queues a delivery of one event to every active webhook that names it, or its module's `<module>.*`. */
export async function queueWebhooks(event: { id: string, name: string }, unit: UnitView): Promise<string[]> {
  const module = event.name.split('.')[0]
  const hooks = await all<{ id: string }>(
    `SELECT id FROM core_webhooks w WHERE state = 'active'
       AND EXISTS (SELECT 1 FROM json_each(w.events) e WHERE e.value = ? OR e.value = ?)`,
    event.name, `${module}.*`,
  )
  const ids: string[] = []
  for (const hook of hooks) {
    const id = newId('whd')
    // A repeat of the same event to the same webhook is ignored: the pair is unique.
    unit.add({ sql: 'INSERT OR IGNORE INTO core_webhook_deliveries (id, webhook_id, event_id, event_name, state, attempts, created_at) VALUES (?, ?, ?, ?, \'queued\', 0, ?)', params: [id, hook.id, event.id, event.name, nowMs()] })
    ids.push(id)
  }
  if (ids.length) unit.enqueue('core.send-webhook', { deliveryIds: ids })
  return ids
}

interface PublicRecord { type: string, id: string, title: string | null }

// The public title of a core record, read afresh. Only records whose title is public: a production
// (published or cancelled), its performance, a season (published or archived), a venue or a space.
async function publicTitle(type: string | null, id: string | null): Promise<string | null> {
  if (!type || !id) return null
  const sql: Record<string, string> = {
    'core.production': 'SELECT title FROM core_productions WHERE id = ? AND state IN (\'published\', \'cancelled\')',
    'core.performance': 'SELECT p.title FROM core_performances f JOIN core_productions p ON p.id = f.production_id WHERE f.id = ? AND p.state IN (\'published\', \'cancelled\')',
    'core.season': 'SELECT name AS title FROM core_seasons WHERE id = ? AND state IN (\'published\', \'archived\')',
    'core.venue': 'SELECT name AS title FROM core_venues WHERE id = ?',
    'core.space': 'SELECT name AS title FROM core_spaces WHERE id = ?',
  }
  if (!sql[type]) return null
  return (await first<{ title: string }>(sql[type]!, id))?.title ?? null
}

export interface WebhookMessage {
  id: string
  event: string
  version: number
  occurredAt: string
  record: PublicRecord | null
  data: Record<string, unknown>
  test?: true
}

/** The body for a format. JSON is the message itself; Discord and Slack get one line of text. */
export function bodyFor(format: WebhookFormat, message: WebhookMessage): string {
  if (format === 'json') return JSON.stringify(message)
  const line = [message.test ? '[Test]' : '', message.event, message.record?.title ? `· ${message.record.title}` : ''].filter(Boolean).join(' ')
  // No mention can be triggered by a title: Discord is told to parse none, and Slack escapes < > &.
  if (format === 'discord') return JSON.stringify({ content: line, allowed_mentions: { parse: [] } })
  return JSON.stringify({ text: line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') })
}

function base64(bytes: ArrayBuffer | Uint8Array): string {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s)
}

/** A new secret: "whsec_" and 32 random bytes in base64, as Standard Webhooks spells one. */
export function newSecret(): string {
  return `whsec_${base64(crypto.getRandomValues(new Uint8Array(32)))}` // not-policy: 256 bits
}

/** The Standard Webhooks signature of a body: "v1,<base64 HMAC-SHA256>". */
export async function sign(secret: string, id: string, timestamp: number, body: string): Promise<string> {
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return `v1,${base64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))}`
}

export interface PostResult { ok: boolean, status: number | null, error: string | null, retry: boolean }

/** Posts one message to one webhook. Never throws; says whether a failure is worth retrying. */
export async function post(hook: { format: WebhookFormat, url: string, secret: string | null }, message: WebhookMessage): Promise<PostResult> {
  const body = bodyFor(hook.format, message)
  const timestamp = Math.floor(nowMs() / 1000) // not-policy: seconds since the epoch
  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'Proscenium-Webhooks/1' }
  if (hook.format === 'json') {
    headers['webhook-id'] = message.id
    headers['webhook-timestamp'] = String(timestamp)
    headers['webhook-signature'] = await sign(hook.secret!, message.id, timestamp, body)
  }
  const timeout = await useSetting('core.webhooks.timeout') as number
  try {
    const response = await fetch(hook.url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(timeout * 1000) }) // not-policy: seconds to milliseconds
    // The receiver's body is never read or kept: only its status.
    await response.body?.cancel()
    if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status, error: null, retry: false } // not-policy: HTTP success
    // A receiver that is down or busy may come back; one that refuses the request will not.
    const retry = response.status >= 500 || response.status === 408 || response.status === 429 // not-policy: HTTP's temporary failures
    return { ok: false, status: response.status, error: response.status >= 300 && response.status < 400 ? 'redirect' : 'status', retry } // not-policy: HTTP redirects
  }
  catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { ok: false, status: null, error: timedOut ? 'timeout' : 'network', retry: true }
  }
}

interface DueRow {
  id: string
  webhook_id: string
  event_id: string
  event_name: string
  attempts: number
  format: WebhookFormat
  url: string
  secret: string | null
  name: string
  hook_state: string
  record_type: string | null
  record_id: string | null
  payload: string | null
  announced_at: number | null
}

/** The wait before attempt n + 1: a minute, then four times the last, at most twelve hours. */
export const retryWait = (attempt: number) => Math.min(60 * 4 ** (attempt - 1), 12 * 3600) // not-policy: the growing waits C-51 asks for

/** Sends each of the given deliveries still due whose webhook is active. Retries go back on the queue through `unit`. */
export async function sendWebhookDeliveries(ids: readonly string[], unit: UnitView): Promise<{ sent: number, retrying: number, failed: number }> {
  const counts = { sent: 0, retrying: 0, failed: 0 }
  const due = await all<DueRow>(
    `SELECT d.id, d.webhook_id, d.event_id, d.event_name, d.attempts, w.format, w.url, w.secret, w.name, w.state AS hook_state,
        e.record_type, e.record_id, e.payload, e.announced_at
       FROM core_webhook_deliveries d JOIN core_webhooks w ON w.id = d.webhook_id LEFT JOIN core_events e ON e.id = d.event_id
      WHERE d.id IN (SELECT value FROM json_each(?)) AND d.state IN ('queued', 'retrying') AND w.state = 'active'
      ORDER BY d.created_at`,
    JSON.stringify(ids),
  )
  if (!due.length) return counts
  const maxAttempts = await useSetting('core.webhooks.max-attempts') as number
  const pauseAfter = await useSetting('core.webhooks.pause-after') as number
  const versions = new Map(deliverableEvents().map(e => [e.name, e.version]))
  const retries = new Map<number, string[]>()
  // A webhook paused part-way through stops here; its other deliveries wait, queued, for it to resume.
  const paused = new Set<string>()

  for (const row of due) {
    if (paused.has(row.webhook_id)) continue
    const claim = createUnit()
    // The lease: a send that dies leaves the delivery sending until the sweep takes it back.
    claim.add({ sql: 'UPDATE core_webhook_deliveries SET state = \'sending\', attempts = attempts + 1, next_attempt_at = ? WHERE id = ? AND state IN (\'queued\', \'retrying\')', params: [nowMs() + 10 * 60_000, row.id] }).expect(1) // not-policy: a send never takes ten minutes
    try {
      await claim.commit()
    }
    catch (error) {
      if (isRefusal(error)) continue
      throw error
    }
    const attempt = row.attempts + 1
    const settle = createUnit()
    if (row.payload === null) {
      // The event is gone (it should never be): nothing can be rebuilt, so nothing is sent.
      settle.add({ sql: 'UPDATE core_webhook_deliveries SET state = \'failed\', last_error = \'event-missing\', next_attempt_at = NULL WHERE id = ?', params: [row.id] })
      await settle.commit()
      counts.failed++
      continue
    }
    const message: WebhookMessage = {
      id: row.id,
      event: row.event_name,
      version: versions.get(row.event_name) ?? 1,
      occurredAt: new Date(row.announced_at!).toISOString(),
      record: row.record_type && row.record_id ? { type: row.record_type, id: row.record_id, title: await publicTitle(row.record_type, row.record_id) } : null,
      data: JSON.parse(row.payload) as Record<string, unknown>,
    }
    const result = await post({ format: row.format, url: (await openColumn(row.url))!, secret: await openColumn(row.secret) }, message)
    if (result.ok) {
      settle.add({ sql: 'UPDATE core_webhook_deliveries SET state = \'sent\', response_status = ?, last_error = NULL, next_attempt_at = NULL, sent_at = ? WHERE id = ?', params: [result.status, nowMs(), row.id] })
      settle.add({ sql: 'UPDATE core_webhooks SET consecutive_failures = 0, last_success_at = ? WHERE id = ?', params: [nowMs(), row.webhook_id] })
      await settle.commit()
      counts.sent++
      continue
    }
    const again = result.retry && attempt < maxAttempts
    if (again) {
      const wait = retryWait(attempt)
      settle.add({ sql: 'UPDATE core_webhook_deliveries SET state = \'retrying\', response_status = ?, last_error = ?, next_attempt_at = ? WHERE id = ?', params: [result.status, result.error, nowMs() + wait * 1000, row.id] }) // not-policy: seconds to milliseconds
      retries.set(wait, [...(retries.get(wait) ?? []), row.id])
      counts.retrying++
    }
    else {
      settle.add({ sql: 'UPDATE core_webhook_deliveries SET state = \'failed\', response_status = ?, last_error = ?, next_attempt_at = NULL WHERE id = ?', params: [result.status, result.error, row.id] })
      counts.failed++
    }
    // Every failed attempt counts towards the pause; the one that reaches the setting pauses it.
    const failures = (await first<{ n: number }>('SELECT consecutive_failures + 1 AS n FROM core_webhooks WHERE id = ?', row.webhook_id))?.n ?? 1
    settle.add({ sql: 'UPDATE core_webhooks SET consecutive_failures = consecutive_failures + 1 WHERE id = ?', params: [row.webhook_id] })
    if (failures >= pauseAfter) {
      settle.add({ sql: 'UPDATE core_webhooks SET state = \'failing\' WHERE id = ? AND state = \'active\'', params: [row.webhook_id] })
      settle.announce('core.webhook.paused', { webhookId: row.webhook_id, failures })
      const managers = await holdersOf('core.webhook.manage')
      if (managers.length) {
        await notify(settle, 'core.webhook.paused', {
          to: managers,
          variables: { webhook: row.name, failures: String(failures), link: await siteUrl(`/admin/webhooks/${row.webhook_id}`) },
          dedupeKey: `core.webhook.paused:${row.webhook_id}:${failures}`,
        })
      }
    }
    await settle.commit()
    if (failures >= pauseAfter) paused.add(row.webhook_id)
  }
  for (const [wait, list] of retries) unit.enqueue('core.send-webhook', { deliveryIds: list }, { delay: wait })
  return counts
}

/** Sends a marked test message now, outside the log, and answers with the receiver's status. */
export async function sendTest(hook: { format: WebhookFormat, url: string, secret: string | null }): Promise<PostResult> {
  return post(hook, {
    id: newId('whd', { random: true }),
    event: 'core.webhook.test',
    version: 1,
    occurredAt: new Date(nowMs()).toISOString(),
    record: null,
    data: {},
    test: true,
  })
}
