// People without a sign-in (identity part 4, "People without a sign-in"; ID-05, ID-06). Every
// person a module records is an account. A guest buyer, somebody named on another's booking, a
// person staff add and a person invited to a role are all unclaimed accounts until they prove
// their address. This is the one way any module makes one.
import { newId, nowMs, refuse, type UnitView } from '#kit'
import { accountById, addressRow, canonicalAccount, normaliseAddress } from './accounts'

export type UnclaimedOrigin = 'guest' | 'named-by-other' | 'invite' | 'staff'

export interface FindOrCreateInput {
  /** The address the person gave. Absent only for a name on a list with no address (origin staff). */
  address?: string | null
  name?: string | null
  origin: UnclaimedOrigin
  /**
   * 'any' (the default, for a purchase) attaches to the claimed account that has verified the
   * address. 'unclaimed-only' refuses that instead, for anything that is not a purchase.
   */
  attach?: 'any' | 'unclaimed-only'
}

export interface FoundAccount {
  accountId: string
  created: boolean
  /** For an account made now: the address it was made with, which the caller's unit has not written yet. */
  madeWith?: { address: string } | null
  /** The address belongs to somebody who has signed in; the caller shows the typist nothing about them. */
  claimed: boolean
}

// added_by for the address row, from the origin that made the account.
const ADDED_BY: Record<UnclaimedOrigin, 'checkout' | 'staff'> = { 'guest': 'checkout', 'named-by-other': 'checkout', 'invite': 'staff', 'staff': 'staff' }

/**
 * The account for an address, made now as unclaimed if there is none. Never makes a second account
 * for an address: the unique address is the write that decides a race, so two requests at once
 * make one account and the loser's unit fails. Adds its statements to the caller's unit and
 * creates no session.
 *
 * - An address an account has verified, or the address an unclaimed account was made with, is
 *   that account.
 * - An address somebody added to their own account and has not verified matches nothing: the
 *   address moves to a new unclaimed account, so the order is not shown to whoever typed it in.
 *   When they verify it, the unclaimed account is merged into theirs (part 3, "An address").
 */
export async function findOrCreateAccount(unit: UnitView, input: FindOrCreateInput): Promise<FoundAccount> {
  const address = input.address ? normaliseAddress(input.address) : null
  if (address) {
    const row = await addressRow(address)
    if (row) {
      const accountId = await canonicalAccount(row.account_id)
      const account = await accountById(accountId)
      const claimed = !!account?.first_signed_in_at
      if (account && !account.anonymised_at && (!claimed || row.verified_at)) {
        if (claimed && input.attach === 'unclaimed-only')
          refuse('core.account.address-claimed', 'Somebody already has an account with this address.', { status: 409, remedy: 'Ask them to do this themselves, signed in.' })
        return { accountId, created: false, claimed }
      }
      // Held unverified by a claimed account: it matches nothing, and moves to a new account.
      const created = createUnclaimed(unit, input, row.id)
      unit.add({ sql: 'UPDATE core_account_emails SET account_id = ? WHERE id = ? AND verified_at IS NULL', params: [created, row.id] })
        .expect(1, { code: 'core.account.address-changed', reason: 'That address was verified a moment ago.', remedy: 'Try again.' })
      return { accountId: created, created: true, claimed: false, madeWith: { address: row.address } }
    }
  }
  return { accountId: createUnclaimed(unit, { ...input, address }), created: true, claimed: false, madeWith: address ? { address } : null }
}

/** Makes the account, with a new address row, or pointing at an existing row the caller moves to it. */
function createUnclaimed(unit: UnitView, input: FindOrCreateInput, movedEmailId?: string): string {
  const at = nowMs()
  const accountId = newId('acc')
  const emailId = movedEmailId ?? (input.address ? newId('aem') : null)
  unit.add({
    sql: 'INSERT INTO core_accounts (id, name, origin, created_at, audience_email_id) VALUES (?, ?, ?, ?, ?)',
    params: [accountId, input.name?.trim() || null, input.origin, at, emailId],
  })
  if (emailId && !movedEmailId) {
    unit.add({
      sql: 'INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
      params: [emailId, accountId, input.address, ADDED_BY[input.origin], at],
    })
  }
  unit.announce('core.account.created', { accountId, origin: input.origin }, { record: ['core.account', accountId] })
  return accountId
}
