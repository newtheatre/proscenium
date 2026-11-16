// Providers and the accounts configured with them. A provider is a contribution to payments.provider;
// a provider account is one configured connection, with the methods it offers on each channel.
import { all, credential, first, usePoint } from '#kit'
import type { Method, PaymentProvider } from './points/provider'

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
