// Providers and the accounts configured with them. A provider is a contribution to payments.provider;
// a provider account is one configured connection, with the methods it offers on each channel.
import { all, credential, first, usePoint } from '#kit'
import type { Method, PaymentProvider, ProviderAttempt } from './points/provider'

export interface ProviderAccountRow { id: string, provider: string, label: string, channels: string, mode: 'live' | 'test', external_ref: string | null, active: number }

export async function providers(): Promise<Map<string, PaymentProvider>> {
  return new Map((await usePoint<PaymentProvider>('payments.provider')).map(c => [c.id, c.value]))
}

export async function providerAccount(id: string): Promise<ProviderAccountRow | null> {
  return first<ProviderAccountRow>('SELECT * FROM payments_provider_accounts WHERE id = ?', id)
}

/** The secrets a provider needs that are not set. A provider missing one is unavailable. */
export async function missingSecrets(provider: PaymentProvider): Promise<string[]> {
  const missing: string[] = []
  for (const name of provider.secrets) if (!(await credential(name))) missing.push(name)
  return missing
}

/** The ledger account money taken by `method` on `providerAccountId` lands in first. */
export function clearingFor(method: Method, providerAccountId: string): { key: string, scope?: string } {
  return method === 'cash' ? { key: 'payments.cash' } : { key: 'payments.card-clearing', scope: providerAccountId }
}

export interface MethodOffer { providerAccountId: string, provider: string, label: string, method: Method, mode: 'live' | 'test' }

/** The payment methods on offer on a channel, from active provider accounts whose provider is ready. */
export async function methodsFor(channel: 'online' | 'desk'): Promise<MethodOffer[]> {
  const known = await providers()
  const rows = await all<ProviderAccountRow>('SELECT * FROM payments_provider_accounts WHERE active = 1 ORDER BY created_at')
  const out: MethodOffer[] = []
  for (const row of rows) {
    const provider = known.get(row.provider)
    if (!provider || !(JSON.parse(row.channels) as string[]).includes(channel)) continue
    if ((await missingSecrets(provider)).length) continue
    for (const m of provider.methods) if (m.channels.includes(channel)) out.push({ providerAccountId: row.id, provider: row.provider, label: row.label, method: m.method, mode: row.mode })
  }
  return out
}

export interface AttemptRowForProvider { id: string, intent_id: string, provider_account_id: string, method: Method, amount_minor: number, idempotency_key: string, provider_ref: string | null, reader_id: string | null, started_at: number }

/** An attempt as its provider is told about it, with the provider that serves it. */
export async function forProvider(attempt: AttemptRowForProvider, origin?: string): Promise<{ provider: PaymentProvider | undefined, attempt: ProviderAttempt }> {
  const row = await first<{ provider: string, external_ref: string | null, mode: 'live' | 'test', currency: string, reader_ref: string | null }>(
    `SELECT a.provider, a.external_ref, a.mode, i.currency, r.external_ref AS reader_ref FROM payments_provider_accounts a
      JOIN payments_intents i ON i.id = ? LEFT JOIN payments_readers r ON r.id = ? WHERE a.id = ?`, attempt.intent_id, attempt.reader_id, attempt.provider_account_id)
  if (!row) throw new Error(`attempt ${attempt.id} has no provider account`)
  return {
    provider: (await providers()).get(row.provider),
    attempt: { id: attempt.id, intentId: attempt.intent_id, providerAccountId: attempt.provider_account_id, externalRef: row.external_ref, mode: row.mode, method: attempt.method, amountMinor: attempt.amount_minor, currency: row.currency, idempotencyKey: attempt.idempotency_key, providerRef: attempt.provider_ref, readerExternalRef: row.reader_ref, startedAt: attempt.started_at, webhookUrl: origin ? `${origin}/api/payments/webhooks/${attempt.provider_account_id}` : undefined, origin },
  }
}
