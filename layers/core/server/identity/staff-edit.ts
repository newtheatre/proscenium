// Staff edit somebody's account for them (ID-46). The address rules are the person's own (ID-12),
// reached through these; only a living account can be edited.
import { refuse } from '#kit'
import { accountById, type AccountRow } from './accounts'

/** The account staff are editing: not erased and not merged into another. */
export async function editableAccount(id: string): Promise<AccountRow> {
  const account = await accountById(id)
  if (!account || account.merged_into_id || account.anonymised_at) return refuse('core.not-found', 'There is no such person.', { status: 404 })
  return account
}
