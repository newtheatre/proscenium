// The suppression list (group 5): addresses no email goes to, whoever asks. Rows hold a keyed hash
// of the lower-cased address, never the address, so the list names nobody.
import { all } from '#kit'
import { digest } from '../identity/crypto'

export function addressHash(address: string): Promise<string> {
  return digest('core.email-suppression', address.trim().toLowerCase())
}

/** Which of these addresses are on the list now. Answers in one query. */
export async function suppressedAddresses(addresses: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(addresses.map(a => a.trim().toLowerCase()))]
  if (!unique.length) return new Set()
  const hashes = new Map<string, string>()
  for (const address of unique) hashes.set(await addressHash(address), address)
  const rows = await all<{ address_hash: string }>(
    'SELECT address_hash FROM core_email_suppressions WHERE lifted_at IS NULL AND address_hash IN (SELECT value FROM json_each(?))',
    JSON.stringify([...hashes.keys()]),
  )
  return new Set(rows.map(r => hashes.get(r.address_hash)!))
}
