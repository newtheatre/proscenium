// A provider's webhook (Box office specification, part 4, "Routes that are not behind an ability").
// Every delivery is stored by the provider's event id, verified or not; only a verified event is acted
// on, and only once, by the job payments.handle-webhook, which asks the provider for the truth rather
// than trusting the body. The body itself is never stored.
import { z } from 'zod'
import { getRequestHeaders, getRequestURL, getRouterParam, readRawBody, setResponseStatus } from 'h3'
import { credential, defineRoute, first, newId, nowMs, Refusal } from '#kit'
import { providerAccount, providers } from '../../../providers'

const BAD_REQUEST = 400 // not-policy: HTTP status for a body or signature that does not verify

export default defineRoute({
  public: true,
  rateLimit: 'default',
  body: 'binary',
  input: z.object({}),
}, async (event, { unit }) => {
  const account = await providerAccount(getRouterParam(event, 'account') ?? '')
  const provider = account?.active ? (await providers()).get(account.provider) : undefined
  if (!account || !provider?.verifyWebhook || !provider.capabilities.includes('webhooks'))
    throw new Refusal('core.not-found', 'There is nothing here.', { status: 404 })

  const body = (await readRawBody(event, 'utf8')) ?? ''
  const secret = provider.webhookSecret ? await credential(provider.webhookSecret) ?? undefined : undefined
  const verified = await provider.verifyWebhook({ body, headers: getRequestHeaders(event) as Record<string, string>, secret, url: getRequestURL(event).href, providerAccountId: account.id })
  if (!verified?.eventId) {
    setResponseStatus(event, BAD_REQUEST)
    return { received: false }
  }

  const id = newId('pwe')
  const at = nowMs()
  if (!verified.ok) {
    unit.add({ sql: 'INSERT INTO payments_webhook_events (id, provider_account_id, provider_event_id, type, signature_ok, received_at) VALUES (?, ?, ?, ?, 0, ?)', params: [id, account.id, verified.eventId, verified.type, at] })
    setResponseStatus(event, BAD_REQUEST)
    return { received: false }
  }

  const seen = await first<{ id: string }>('SELECT id FROM payments_webhook_events WHERE provider_account_id = ? AND provider_event_id = ? AND signature_ok = 1', account.id, verified.eventId)
  if (seen) return { received: true }
  const attempt = verified.attemptId
    ? await first<{ id: string }>('SELECT id FROM payments_attempts WHERE provider_account_id = ? AND id = ?', account.id, verified.attemptId)
    : verified.providerRef
      ? await first<{ id: string }>('SELECT id FROM payments_attempts WHERE provider_account_id = ? AND provider_ref = ?', account.id, verified.providerRef)
      : null
  // A race with the same delivery meets the unique index and inserts nothing; its job finds no row.
  unit.add({
    sql: `INSERT INTO payments_webhook_events (id, provider_account_id, provider_event_id, type, signature_ok, attempt_id, received_at, handled_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT (provider_account_id, provider_event_id) WHERE signature_ok = 1 DO NOTHING`,
    params: [id, account.id, verified.eventId, verified.type, attempt?.id ?? null, at, attempt ? null : at],
  })
  if (attempt) unit.enqueue('payments.handle-webhook', { webhookEventId: id })
  return { received: true }
})
