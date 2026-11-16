// Finding rows by a person's name or email (Identity Doc part 4; Foundations' ruling for the box
// office desk). findAccounts answers an SQL subquery of account ids, never a list, for the caller to
// put inside its own list's condition through inAccountScope. It searches a person's name, the name
// they go by and their verified addresses, by the list search rules (three letters, folding, every
// word, no ranking), on the indexes identity declares in server/lists. It finds claimed, unclaimed
// and disabled accounts, a merged-away account as its survivor, and never a tombstone. Each call
// writes one audit entry naming the caller and the list; what was typed is never written anywhere.
import { sql, type SQL } from 'drizzle-orm'
import { requireAbility, searchIndexName, searchQuery, searchWords, type Actor, type UnitView } from '#kit'
import type { ListDeclaration } from '../../shared/list'

export const FIND_ABILITY = 'core.account.find'

const NAMES = searchIndexName('core_accounts')
const ADDRESSES = searchIndexName('core_account_emails')

/**
 * The accounts whose name, preferred name or a verified address holds every word of `text`, as a
 * subquery of ids for `column IN (…)`: each found person's living account and every account merged
 * into it, so a row not yet moved by a merge is found too. Refuses an actor without
 * core.account.find; it never answers an empty subquery in place of a refusal. With no word of
 * three letters it matches nobody; a list reads its own search words with readList and leaves the
 * filter off when the search is too short. `list` is the declared list the search is for, named in
 * the audit entry.
 */
export async function findAccounts(unit: UnitView, actor: Actor, text: string, list: Pick<ListDeclaration, 'id'>): Promise<SQL> {
  await requireAbility(actor, FIND_ABILITY)
  if (!/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(list.id)) throw new Error(`findAccounts: "${list.id}" is not a list id`) // not-policy: the shape of a list id
  unit.audit({ action: 'read', ability: FIND_ABILITY, detail: { list: list.id } })
  const { words } = searchWords(text)
  if (!words.length) return sql`SELECT NULL WHERE 0`
  // Every word in the account's names, or every word in one verified address of it.
  const found = sql`SELECT coalesce(a.merged_into_id, a.id) FROM core_accounts a
     WHERE a.anonymised_at IS NULL
       AND (a.rowid IN (SELECT rowid FROM ${sql.identifier(NAMES)} WHERE ${sql.identifier(NAMES)} MATCH ${searchQuery(words, ['name', 'preferred_name'])})
         OR a.id IN (SELECT e.account_id FROM core_account_emails e WHERE e.verified_at IS NOT NULL
                       AND e.rowid IN (SELECT rowid FROM ${sql.identifier(ADDRESSES)} WHERE ${sql.identifier(ADDRESSES)} MATCH ${searchQuery(words, ['address'])})))`
  return sql`SELECT s.id FROM core_accounts s WHERE s.anonymised_at IS NULL AND s.id IN (${found})
     UNION SELECT m.id FROM core_accounts m WHERE m.merged_into_id IN (${found})`
}
