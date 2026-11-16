// The address to write to on each side (identity part 4, "Three services the core domain asked
// for"). Notifications resolve a whole set of recipients at once, so the set form is the one that
// queries; the single form reads through it.
import { all } from '#kit'

export type Side = 'audience' | 'members'

// D1 binds at most 100 parameters to a statement; leave room for the side.
const CHUNK = 90 // not-policy: D1's bound-parameter limit

interface AddressRow {
  id: string
  first_signed_in_at: number | null
  audience: string | null
  audience_verified: number | null
  members: string | null
  members_verified: number | null
}

/**
 * For each account, the address that side should write to, or null. The members' side falls back
 * to the audience address. A claimed account is written to only at a verified address; an
 * unclaimed account at the address it was created with, which nobody has proved yet but which is
 * where the order or invitation that made it was meant to go. A disabled account, an alias left
 * by a merge and a tombstone get nothing, and so does an id that names no account.
 */
export async function addressesFor(accountIds: readonly string[], side: Side): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const ids = [...new Set(accountIds)]
  for (const id of ids) out.set(id, null)
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const rows = await all<AddressRow>(
      `SELECT a.id, a.first_signed_in_at,
              au.address AS audience, au.verified_at AS audience_verified,
              me.address AS members, me.verified_at AS members_verified
         FROM core_accounts a
         LEFT JOIN core_account_emails au ON au.id = a.audience_email_id AND au.account_id = a.id
         LEFT JOIN core_account_emails me ON me.id = a.members_email_id AND me.account_id = a.id
        WHERE a.id IN (${chunk.map(() => '?').join(', ')})
          AND a.disabled_at IS NULL AND a.merged_into_id IS NULL AND a.anonymised_at IS NULL`,
      ...chunk,
    )
    for (const row of rows) out.set(row.id, pick(row, side))
  }
  return out
}

/** The single form of `addressesFor`. */
export async function addressFor(accountId: string, side: Side): Promise<string | null> {
  return (await addressesFor([accountId], side)).get(accountId) ?? null
}

function pick(row: AddressRow, side: Side): string | null {
  const claimed = row.first_signed_in_at !== null
  const usable = (address: string | null, verified: number | null) => address !== null && (verified !== null || !claimed) ? address : null
  const audience = usable(row.audience, row.audience_verified)
  if (side === 'audience') return audience
  return usable(row.members, row.members_verified) ?? audience
}
