// Accounts and addresses: finding the account behind an address, making one on first proof,
// following a merge to the survivor, and the label other modules show for a person.
import { all, first, newId, nowMs, type UnitView } from '#kit'

export interface AccountRow {
  id: string
  name: string | null
  preferred_name: string | null
  pronouns: string | null
  phone: string | null
  locale: string | null
  origin: string
  created_at: number
  first_signed_in_at: number | null
  last_signed_in_at: number | null
  disabled_at: number | null
  disabled_reason: string | null
  merged_into_id: string | null
  anonymised_at: number | null
  audience_email_id: string | null
  members_email_id: string | null
}

const MERGE_DEPTH = 8 // not-policy: a chain of merges is short; more means a loop

/** Addresses are compared trimmed and in lower case, exactly as col.email stores them. */
export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase()
}

export function domainOf(address: string): string {
  return normaliseAddress(address).split('@').pop() ?? ''
}

export async function accountById(id: string): Promise<AccountRow | null> {
  return first<AccountRow>('SELECT * FROM core_accounts WHERE id = ?', id)
}

/** The account an id now stands for: itself, or the survivor of the merges it went into. */
export async function canonicalAccount(id: string): Promise<string> {
  let current = id
  for (let depth = 0; depth < MERGE_DEPTH; depth++) {
    const row = await first<{ merged_into_id: string | null }>('SELECT merged_into_id FROM core_accounts WHERE id = ?', current)
    if (!row?.merged_into_id) return current
    current = row.merged_into_id
  }
  return current
}

/** What other modules show for a person: the name they go by, else their name, else a placeholder. */
export async function accountLabel(id: string): Promise<string> {
  const row = await accountById(await canonicalAccount(id))
  if (!row || row.anonymised_at) return 'Former member'
  return row.preferred_name || row.name || 'Unnamed person'
}

export interface AddressRow { id: string, account_id: string, address: string, verified_at: number | null }

export async function addressRow(address: string): Promise<AddressRow | null> {
  return first<AddressRow>('SELECT id, account_id, address, verified_at FROM core_account_emails WHERE address = ?', normaliseAddress(address))
}

export async function verifiedAddressesOf(accountId: string): Promise<string[]> {
  return (await all<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ? AND verified_at IS NOT NULL ORDER BY created_at', accountId)).map(r => r.address)
}

/** An account that can act: not disabled, not merged away, not erased. */
export function isUsable(row: AccountRow | null): row is AccountRow {
  return !!row && !row.disabled_at && !row.merged_into_id && !row.anonymised_at
}

/**
 * Proof of an address has just been given (a link, a code, a provider). Returns the account it
 * belongs to, creating it now if there is none (ID-01: no account before proof), and marks the
 * address verified and the account claimed. Adds its statements to the unit.
 */
export async function accountForProvenAddress(unit: UnitView, address: string, origin: 'self' | 'provider' | 'setup', options: { name?: string } = {}): Promise<{ accountId: string, created: boolean, claimed: boolean, emailId: string }> {
  const normal = normaliseAddress(address)
  const at = nowMs()
  const existing = await addressRow(normal)
  if (existing) {
    const account = await accountById(existing.account_id)
    if (!existing.verified_at) {
      unit.add({ sql: 'UPDATE core_account_emails SET verified_at = ? WHERE id = ? AND verified_at IS NULL', params: [at, existing.id] })
      unit.announce('core.account-email.verified', { accountId: existing.account_id, emailId: existing.id }, { record: ['core.account', existing.account_id] })
    }
    const claimed = !account?.first_signed_in_at
    if (claimed) {
      unit.add({ sql: 'UPDATE core_accounts SET first_signed_in_at = ? WHERE id = ? AND first_signed_in_at IS NULL', params: [at, existing.account_id] })
      unit.announce('core.account.claimed', { accountId: existing.account_id }, { record: ['core.account', existing.account_id] })
    }
    if (account && !account.audience_email_id) unit.add({ sql: 'UPDATE core_accounts SET audience_email_id = ? WHERE id = ? AND audience_email_id IS NULL', params: [existing.id, existing.account_id] })
    return { accountId: existing.account_id, created: false, claimed, emailId: existing.id }
  }
  const accountId = newId('acc')
  const emailId = newId('aem')
  unit.add({
    sql: 'INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at, audience_email_id) VALUES (?, ?, ?, ?, ?, ?)',
    params: [accountId, options.name ?? null, origin, at, at, emailId],
  })
  // The unique address is the lock: if a second request made an account for this address a
  // moment ago, this insert fails and the whole unit with it, rather than making a second account.
  unit.add({ sql: 'INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [emailId, accountId, normal, at, origin === 'provider' ? 'provider' : origin === 'setup' ? 'setup' : 'self', at] })
  unit.announce('core.account.created', { accountId, origin }, { record: ['core.account', accountId] })
  unit.announce('core.account-email.verified', { accountId, emailId }, { record: ['core.account', accountId] })
  return { accountId, created: true, claimed: true, emailId }
}
