// Account merge and its undo (rules X2, X3). membership_memberships.account_id is a handler column, so
// the memberships move here rather than in the core's move step: first an application of the
// merged-away account that the survivor also has open for the same scheme ends as superseded, with
// its charge voided, and stays with the account it came from, so the two never meet as two pending
// applications (J3); then the rest move to the survivor, listed so an undo puts them back. While
// Membership is off a merge waits only for an account that holds memberships. Everything else is as it was: the facts, the requirement answer and the member number already
// read through the account scope, so two memberships of one scheme count once and the lower number
// is the one shown. Undo puts a superseded application back to pending for the account it came from,
// with a fresh charge where one is owed, unless that account has opened another for the scheme since.
import { all, nowMs, recordMergeItems, type MergeRef, type MergeUndoAnswer, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { sql } from 'drizzle-orm'
import { charger } from '../../charge'
import { todayOrNull } from '../../memberships'

export default {
  async merge(unit: UnitView, ref: MergeRef) {
    const at = nowMs()
    const found = await all<{ id: string }>(
      `SELECT m.id FROM membership_memberships m WHERE m.state = 'pending' AND m.account_id = ?1 -- exact-account: the merged-away account's own rows
         AND EXISTS (SELECT 1 FROM membership_memberships s WHERE s.scheme_id = m.scheme_id AND s.state = 'pending' AND s.id <> m.id AND s.account_id <> ?1 AND s.account_id IN (${accountScopeSql('?2')})) -- exact-account: the survivor's rows, not the merged-away account's`,
      ref.mergedAccountId, ref.survivorId,
    )
    const ids = found.map(f => f.id)
    if (ids.length) await supersede(unit, ref, ids, at)
    // The rest move. A superseded row is already listed as set aside, so it is neither listed nor moved again.
    recordMergeItems(unit, { mergeId: ref.mergeId, table: 'membership_memberships', column: 'account_id', mergedAccountId: ref.mergedAccountId, action: 'moved' })
    unit.add({
      sql: `UPDATE membership_memberships SET account_id = ? WHERE account_id = ? -- exact-account: the merged-away account's own rows
              AND rowid NOT IN (SELECT CAST(row_id AS INTEGER) FROM core_account_merge_items WHERE merge_id = ? AND table_name = 'membership_memberships' AND action <> 'moved')`,
      params: [ref.survivorId, ref.mergedAccountId, ref.mergeId],
    })
  },

  async undo(unit: UnitView, ref: MergeRef): Promise<MergeUndoAnswer> {
    return undoMerge(unit, ref)
  },
}

/** Ends the merged-away account's duplicate applications as superseded, voiding their charges. */
async function supersede(unit: UnitView, ref: MergeRef, ids: string[], at: number): Promise<void> {
  // Listed as set aside and kept when the undo window closes: the row is history either way.
  recordMergeItems(unit, { mergeId: ref.mergeId, table: 'membership_memberships', column: 'account_id', mergedAccountId: ref.mergedAccountId, action: 'set-aside', onClose: 'keep', where: sql`id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})` })
  const fees = await charger()
  for (const id of ids) {
    if (fees) await fees.void(unit, id)
    unit.add({ sql: "UPDATE membership_memberships SET state = 'ended', end_reason = 'superseded', ended_at = ?, updated_at = ? WHERE id = ? AND state = 'pending'", params: [at, at, id] })
  }
}

/** X3, after the core has put the moved rows back: superseded applications return to pending. */
async function undoMerge(unit: UnitView, ref: MergeRef): Promise<MergeUndoAnswer> {
  const at = nowMs()
  const set = await all<{ id: string, account_id: string, scheme_id: string, length_option_id: string | null, needs_payment: number, paid_at: number | null, renews_id: string | null, again: number }>(
    `SELECT m.id, m.account_id, m.scheme_id, m.length_option_id, m.needs_payment, m.paid_at, m.renews_id,
          EXISTS (SELECT 1 FROM membership_memberships o WHERE o.scheme_id = m.scheme_id AND o.state = 'pending' AND o.account_id = m.account_id AND o.id <> m.id) -- exact-account: the account it came back to
            OR (m.renews_id IS NOT NULL AND EXISTS (SELECT 1 FROM membership_memberships r WHERE r.renews_id = m.renews_id AND r.id <> m.id AND r.state IN ('pending', 'active'))) AS again
         FROM membership_memberships m
        WHERE m.state = 'ended' AND m.end_reason = 'superseded'
          AND m.rowid IN (SELECT CAST(row_id AS INTEGER) FROM core_account_merge_items WHERE merge_id = ? AND table_name = 'membership_memberships' AND action IN ('set-aside', 'set-aside-keep'))`,
    ref.mergeId,
  )
  const fees = await charger()
  const day = await todayOrNull()
  let notRestored = 0
  for (const m of set) {
    // Another application opened since, the membership renewed another way, or a fee owed with no way to charge it: it stays ended.
    if (m.again || (m.needs_payment && !m.paid_at && (!fees || !day))) {
      notRestored++
      continue
    }
    unit.add({ sql: "UPDATE membership_memberships SET state = 'pending', end_reason = NULL, ended_at = NULL, updated_at = ? WHERE id = ? AND state = 'ended' AND end_reason = 'superseded'", params: [at, m.id] })
    if (m.needs_payment && !m.paid_at) await fees!.open(unit, { membershipId: m.id, schemeId: m.scheme_id, lengthOptionId: m.length_option_id, kind: m.renews_id ? 'renew' : 'join', on: day! })
  }
  return notRestored ? { notRestored, reason: 'membership.merge.application-not-restored' } : { notRestored: 0 }
}
