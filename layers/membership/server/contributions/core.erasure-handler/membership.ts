// Erasure (rule X4): the person's live memberships and open applications end with the reason
// `erased`, in a stage of the erasure. Everything else is the registry's: the rows stay with their
// scheme and dates so counts by year stay true, notes are redacted, the member number is kept so it
// is never issued again.
//
// A list entry the person claimed is done here, not by the registry: its hash is unique within its
// list, so each erased entry gets a hash of its own that matches nothing, and it lets go of the
// membership, which takes it out of the registry's reach.
//
// The details kept about the member (MEM-34) are custom fields on each membership: forms erases
// their personal and free-text answers.
import { all, nowMs, type UnitView } from '#kit'
import { ERASED } from '#kit/db'
import { accountScopeSql } from '#kit/accounts'
import { eraseRecordFields } from '#modules/forms'

export default {
  async erase(unit: UnitView, subject: { accountId?: string }) {
    if (!subject.accountId) return
    const at = nowMs()
    for (const m of await all<{ id: string }>(`SELECT id FROM membership_memberships WHERE account_id IN (${accountScopeSql('?1')})`, subject.accountId))
      await eraseRecordFields(unit, 'membership.member-fields', m.id)
    unit.add({
      sql: `UPDATE membership_verification_entries SET key_hash = '${ERASED.anonymise}:' || id, holder_name = NULL, used_by = NULL WHERE used_by IN (SELECT id FROM membership_memberships WHERE account_id IN (${accountScopeSql('?1')}))`,
      params: [subject.accountId],
    })
    unit.add({
      sql: `UPDATE membership_memberships SET state = 'ended', end_reason = 'erased', ended_at = ?1, ended_by = NULL, updated_at = ?1 WHERE state IN ('active', 'pending') AND account_id IN (${accountScopeSql('?2')})`,
      params: [at, subject.accountId],
    })
  },
}
