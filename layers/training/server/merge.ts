// When two accounts merge and both hold a place on one session, the stronger place is kept and the
// other cancelled as by the merge; undo puts it back on the waiting list where it still can.
import { sql } from 'drizzle-orm'
import { all, nowMs, recordMergeItems, type MergeRef, type MergeUndoAnswer, type UnitView } from '#kit'

const LIVE = '\'booked\', \'waiting\', \'attended\', \'absent\'' // not-policy: the place states that hold a place
// Attended wins, then booked, then absent, then waiting; as strong and older wins.
const RANK = (alias: string) => `CASE ${alias}.state WHEN 'attended' THEN 4 WHEN 'booked' THEN 3 WHEN 'absent' THEN 2 ELSE 1 END` // not-policy: an order, not a quantity

/** The live places that give way: each for which the other account holds a stronger live place on the same session. */
function losers(ref: MergeRef) {
  const t = sql.raw('training_session_places')
  const two = sql`${ref.survivorId}, ${ref.mergedAccountId}`
  const rank = (alias: string) => sql.raw(RANK(alias))
  return sql`${t}.state IN (${sql.raw(LIVE)}) AND ${t}.account_id IN (${two}) AND EXISTS ( -- exact-account: a merge sets the two accounts against each other
    SELECT 1 FROM training_session_places w
     WHERE w.session_id = ${t}.session_id AND w.id <> ${t}.id AND w.state IN (${sql.raw(LIVE)}) AND w.account_id IN (${two}) AND w.account_id <> ${t}.account_id -- exact-account: the other of the two
       AND (${rank('w')} > ${rank('training_session_places')} OR (${rank('w')} = ${rank('training_session_places')}
         AND (w.created_at < ${t}.created_at OR (w.created_at = ${t}.created_at AND w.id < ${t}.id)))))`
}

export async function mergePlaces(unit: UnitView, ref: MergeRef): Promise<void> {
  const at = nowMs()
  for (const account of [ref.mergedAccountId, ref.survivorId])
    recordMergeItems(unit, { mergeId: ref.mergeId, table: 'training_session_places', column: 'account_id', mergedAccountId: account, action: 'set-aside', onClose: 'keep', where: losers(ref) })
  // The trigger gives the place back to the session when counted falls to nought.
  unit.add(sql`UPDATE training_session_places SET state = 'cancelled', counted = 0, cancelled_at = ${at}, cancel_kind = 'merge', updated_at = ${at} WHERE ${losers(ref)}`)
}

/**
 * Undo: each place this merge cancelled returns on the waiting list, so it takes nobody's place,
 * while its session has not started and its account holds no other place on it.
 */
export async function undoMergePlaces(unit: UnitView, ref: MergeRef): Promise<MergeUndoAnswer> {
  const at = nowMs()
  const set = await all<{ id: string, starts_at: number, status: string, again: number }>(
    `SELECT p.id, s.starts_at, s.status,
        EXISTS (SELECT 1 FROM training_session_places o WHERE o.session_id = p.session_id AND o.id <> p.id AND o.state != 'cancelled' AND o.account_id = p.account_id) AS again -- exact-account: the accounts are parted again
       FROM training_session_places p JOIN training_sessions s ON s.id = p.session_id
      WHERE p.cancel_kind = 'merge' AND p.rowid IN (SELECT row_id FROM core_account_merge_items WHERE merge_id = ? AND table_name = 'training_session_places')`,
    ref.mergeId,
  )
  const reasons: string[] = []
  const back: string[] = []
  for (const p of set) {
    if (p.status !== 'published' || p.starts_at <= at) reasons.push('training.session-begun')
    else if (p.again) reasons.push('training.already-on-session')
    else back.push(p.id)
  }
  if (back.length) {
    unit.add(sql`UPDATE training_session_places SET state = 'waiting', counted = 0, waiting_since = ${at}, cancelled_at = NULL, cancel_kind = NULL, updated_at = ${at}
      WHERE id IN (SELECT value FROM json_each(${JSON.stringify(back)})) AND state = 'cancelled' AND cancel_kind = 'merge'`)
  }
  return reasons.length ? { notRestored: reasons.length, reason: reasons[0] } : { notRestored: 0 }
}
