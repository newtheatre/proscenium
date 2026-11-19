// The person picker's search (identity spec part 5, searchAccounts): people found by name, through
// the same search index as findAccounts, by the list search rules, or by an address typed in full.
// Answers a name and enough to tell two people apart, never their contact details. The caller
// checks the ability: core's own picker route needs core.account.search; a module may offer it
// inside one narrow screen of its own (box office's till, Matt 17 November) under its own ability.
import { all, searchIndexName, searchQuery, searchWords } from '#kit'
import { normaliseAddress } from './accounts'

const NAMES = searchIndexName('core_accounts')
const PAGE = 20 // not-policy: a picker shows a short list

export interface PickerPerson { id: string, label: string, name: string | null, since: number, claimed: boolean, disabled: boolean }

export async function searchAccounts(text: string): Promise<PickerPerson[]> {
  const { words } = searchWords(text)
  const rows = await all<{ id: string, name: string | null, preferred_name: string | null, origin: string, created_at: number, first_signed_in_at: number | null, disabled_at: number | null }>(
    `SELECT DISTINCT a.id, a.name, a.preferred_name, a.origin, a.created_at, a.first_signed_in_at, a.disabled_at
       FROM core_accounts a LEFT JOIN core_account_emails e ON e.account_id = a.id
      WHERE a.merged_into_id IS NULL AND a.anonymised_at IS NULL
        AND (${words.length ? `a.rowid IN (SELECT rowid FROM "${NAMES}" WHERE "${NAMES}" MATCH ?)` : '0'} OR e.address = ?)
      ORDER BY a.name LIMIT ${PAGE}`,
    ...(words.length ? [searchQuery(words, ['name', 'preferred_name'])] : []), normaliseAddress(text),
  )
  return rows.map(r => ({ id: r.id, label: r.name || 'Unnamed person', name: r.name, since: r.created_at, claimed: !!r.first_signed_in_at, disabled: !!r.disabled_at }))
}
