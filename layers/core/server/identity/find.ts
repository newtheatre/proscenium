// Finding rows by a person's name or email (Identity Doc part 4; Foundations' ruling for the box
// office desk). findAccounts answers an SQL subquery of account ids, never a list, for the caller to
// put inside its own list's condition through inAccountScope. It searches a person's name, the name
// they go by and their verified addresses, by the list search rules (three letters, folding, every
// word, no ranking), through the kit's searchCondition on the sources identity declares in
// server/lists. It finds claimed, unclaimed and disabled accounts, a merged-away account as its
// survivor, and never a tombstone. Each call writes one audit entry naming the caller and the list;
// what was typed is never written anywhere.
import { sql, type SQL } from 'drizzle-orm'
import { requireAbility, searchCondition, type Actor, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import accountNames from '../lists/accounts'
import accountAddresses from '../lists/account-emails'

export const FIND_ABILITY = 'core.account.find'

/**
 * The accounts whose name, preferred name or a verified address holds every word of `text`, as a
 * subquery of ids for `column IN (…)`: each found person's living account and every account merged
 * into it, so a row not yet moved by a merge is found too. Refuses an actor without
 * core.account.find; it never answers an empty subquery in place of a refusal. With no word of
 * three letters it matches nobody; a list reads its own search words with readList and leaves the
 * filter off when the search is too short. `listId` is the declared list the search is for, named
 * in the audit entry; a list no module declares a source for is refused.
 */
export async function findAccounts(unit: UnitView, actor: Actor, text: string, listId: string): Promise<SQL> {
  await requireAbility(actor, FIND_ABILITY)
  if (!useRegistry().lists.has(listId)) throw new Error(`findAccounts: no module declares a source for the list "${listId}"`)
  unit.audit({ action: 'read', ability: FIND_ABILITY, detail: { list: listId } })
  // Identity's own sources search no field under an ability, so the caller's abilities are not asked.
  const names = await searchCondition(accountNames, text, { can: () => false })
  if (!names.where) return sql`SELECT NULL WHERE 0`
  const addresses = await searchCondition(accountAddresses, text, { can: () => false })
  // Every word in the account's names, or every word in one verified address of it.
  const found = sql`SELECT coalesce(merged_into_id, id) FROM core_accounts
     WHERE anonymised_at IS NULL
       AND (${names.where}
         OR id IN (SELECT account_id FROM core_account_emails WHERE verified_at IS NOT NULL AND ${addresses.where}))`
  return sql`SELECT s.id FROM core_accounts s WHERE s.anonymised_at IS NULL AND s.id IN (${found})
     UNION SELECT m.id FROM core_accounts m WHERE m.merged_into_id IN (${found})`
}
