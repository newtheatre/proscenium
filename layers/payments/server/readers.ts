// Card readers paired with a provider account (Box office specification, part 3, payments_readers).
// Pairing asks the provider first, from the code the reader shows, then records the reader here.
import { all, first, newId, nowMs, Refusal, type UnitView } from '#kit'
import { providerAccount, providers } from './providers'

export interface ReaderRow { id: string, provider_account_id: string, label: string, external_ref: string | null, active: number, created_at: number }

export async function pairReader(unit: UnitView, providerAccountId: string, input: { pairingCode: string, label: string }): Promise<string> {
  const account = await providerAccount(providerAccountId)
  if (!account) throw new Refusal('core.not-found', 'There is no such provider account.', { status: 404 })
  const provider = (await providers()).get(account.provider)
  if (!provider?.pairReader || !provider.capabilities.includes('reader')) throw new Refusal('payments.reader.not-a-reader-provider', 'This provider has no card readers to pair.', { status: 409 })
  const { externalRef } = await provider.pairReader({ id: account.id, externalRef: account.external_ref }, input)
  const id = newId('rdr')
  const at = nowMs()
  unit.add({ sql: 'INSERT INTO payments_readers (id, provider_account_id, label, external_ref, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', params: [id, account.id, input.label, externalRef, at, at] })
  return id
}

export function listReaders(providerAccountId: string): Promise<ReaderRow[]> {
  return all<ReaderRow>('SELECT * FROM payments_readers WHERE provider_account_id = ? ORDER BY active DESC, label', providerAccountId)
}

/** Stops offering a reader. A payment still waiting on it is answered as usual. */
export async function retireReader(unit: UnitView, readerId: string): Promise<void> {
  if (!(await first('SELECT 1 FROM payments_readers WHERE id = ?', readerId))) throw new Refusal('core.not-found', 'There is no such card reader.', { status: 404 })
  unit.add({ sql: 'UPDATE payments_readers SET active = 0, updated_at = ? WHERE id = ?', params: [nowMs(), readerId] })
}
