// Privacy (part 3, "Privacy" and "Account merge and undo"; FH-35): the merge handler for two
// accounts on one shift, the daily retention sweep, the erasure hold while an incident is open, and
// the staff search and redaction for a person with no account.
import { all, first, localDate, nowMs, recordMergeItems, refuse, useSetting, type MergeRef, type MergeUndoAnswer, type UnitView } from '#kit'
import { ERASED } from '#kit/db'
import { sql } from 'drizzle-orm'
import { accountScopeSql } from '#kit/accounts'
import { LIVE_STATES } from './db/schema'

const SECOND = 1000 // not-policy: settings are whole seconds
const live = LIVE_STATES.map(s => `'${s}'`).join(', ')
// Further along wins: checked in, then confirmed, then asking for cover, then waiting.
const RANK = (alias: string) => `CASE ${alias}.state WHEN 'checked_in' THEN 4 WHEN 'confirmed' THEN 3 WHEN 'release_requested' THEN 2 ELSE 1 END` // not-policy: an order, not a quantity

// ---------------------------------------------------------------------------------------------
// Account merge (step 1 and 2 of part 3, "Account merge and undo")

/**
 * The live assignments that give way when both accounts are on one shift: each one for which the
 * other account holds a live assignment on the same shift that is further along, or as far along
 * and older. Written against the table's own name so it works inside recordMergeItems.
 */
function losers(ref: MergeRef) {
  const t = sql.raw('front_of_house_assignments')
  const states = sql.raw(live)
  const two = sql`${ref.survivorId}, ${ref.mergedAccountId}`
  const rank = (alias: string) => sql.raw(RANK(alias))
  return sql`${t}.state IN (${states}) AND ${t}.account_id IN (${two}) AND EXISTS ( -- exact-account: a merge sets the two accounts against each other
    SELECT 1 FROM front_of_house_assignments w
     WHERE w.shift_id = ${t}.shift_id AND w.id <> ${t}.id AND w.state IN (${states}) AND w.account_id IN (${two}) AND w.account_id <> ${t}.account_id -- exact-account: the other of the two
       AND (${rank('w')} > ${rank('front_of_house_assignments')} OR (${rank('w')} = ${rank('front_of_house_assignments')}
         AND (w.created_at < ${t}.created_at OR (w.created_at = ${t}.created_at AND w.id < ${t}.id)))))`
}

export async function mergeAccounts(unit: UnitView, ref: MergeRef): Promise<void> {
  const at = nowMs()
  // The merged-away account's losing rows are listed as set aside, kept when the undo window closes.
  recordMergeItems(unit, { mergeId: ref.mergeId, table: 'front_of_house_assignments', column: 'account_id', mergedAccountId: ref.mergedAccountId, action: 'set-aside', onClose: 'keep', where: losers(ref) })
  unit.add(sql`UPDATE front_of_house_assignments SET state = 'released', freed_by_merge = ${ref.mergeId}, ended_at = ${at}, updated_at = ${at} WHERE ${losers(ref)}`)
  // Places are recounted from the stamp, never from a count of changed rows: a second run changes nothing.
  unit.add(sql`UPDATE front_of_house_shifts SET places_taken = (SELECT count(*) FROM front_of_house_assignments a WHERE a.shift_id = front_of_house_shifts.id AND a.state IN (${sql.raw(live)})), updated_at = ${at}
    WHERE id IN (SELECT shift_id FROM front_of_house_assignments WHERE freed_by_merge = ${ref.mergeId})`)
}

/**
 * Undo (steps 3 and 4): after the core has moved the column back, each assignment this merge set
 * aside returns as a new sign-up would, when its call time is ahead, a place is free and the
 * account has no other live assignment on the shift. Nothing is taken from anyone else.
 */
export async function undoMerge(unit: UnitView, ref: MergeRef): Promise<MergeUndoAnswer> {
  const at = nowMs()
  const stamped = await all<{ id: string, shift_id: string, account_id: string, call_at: number, places: number, places_taken: number, again: number }>(
    `SELECT a.id, a.shift_id, a.account_id, s.call_at, s.places, s.places_taken,
        EXISTS (SELECT 1 FROM front_of_house_assignments o WHERE o.shift_id = a.shift_id AND o.account_id = a.account_id AND o.id <> a.id AND o.state IN (${live})) AS again
       FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE a.freed_by_merge = ? AND a.state = 'released'`, ref.mergeId)
  if (!stamped.length) return { notRestored: 0 }
  const state = await useSetting('front-of-house.shifts.confirmation') === 'manager' ? 'requested' : 'confirmed'
  const reasons: string[] = []
  const back: string[] = []
  for (const s of stamped) {
    if (s.call_at <= at) reasons.push('front-of-house.shift-begun')
    else if (s.again) reasons.push('front-of-house.already-on-shift')
    else if (s.places_taken >= s.places) reasons.push('front-of-house.shift-full')
    else back.push(s.id)
  }
  if (back.length) {
    unit.add(sql`UPDATE front_of_house_assignments SET state = ${state}, freed_by_merge = NULL, ended_at = NULL, updated_at = ${at}
      WHERE id IN (SELECT value FROM json_each(${JSON.stringify(back)})) AND state = 'released'`)
    unit.add(sql`UPDATE front_of_house_shifts SET places_taken = (SELECT count(*) FROM front_of_house_assignments a WHERE a.shift_id = front_of_house_shifts.id AND a.state IN (${sql.raw(live)})), updated_at = ${at}
      WHERE id IN (SELECT shift_id FROM front_of_house_assignments WHERE id IN (SELECT value FROM json_each(${JSON.stringify(back)})))`)
  }
  return reasons.length ? { notRestored: reasons.length, reason: reasons[0] } : { notRestored: 0 }
}

// ---------------------------------------------------------------------------------------------
// Retention (the daily sweep in close-shifts)

/** Removes what is past its period. Each statement is set-wise and safe to run again. */
export async function sweep(unit: UnitView): Promise<void> {
  const at = nowMs()
  const assignments = await useSetting('front-of-house.retention.assignments') as number
  const checklists = await useSetting('front-of-house.retention.checklists') as number
  const incidents = await useSetting('front-of-house.retention.incidents') as number
  const child = await useSetting('front-of-house.retention.incidents-child') as number
  // Rota history, counted from the shift's end. A live assignment is never swept.
  unit.add({
    sql: `DELETE FROM front_of_house_assignments WHERE state NOT IN (${live})
      AND shift_id IN (SELECT id FROM front_of_house_shifts WHERE ends_at < ?)`,
    params: [at - assignments * SECOND],
  })
  // A handout's size, counted from its crew call's last day. The rows stay: they are append-only.
  unit.add({
    sql: `UPDATE front_of_house_handouts SET size = NULL WHERE size IS NOT NULL
      AND crew_call_id IN (SELECT id FROM front_of_house_crew_calls WHERE ends_on < ?)`,
    params: [await localDate(at - assignments * SECOND)],
  })
  // Checklist runs and their entries.
  const oldRuns = 'SELECT id FROM front_of_house_checklist_runs WHERE created_at < ?'
  unit.add({ sql: `DELETE FROM front_of_house_checklist_entries WHERE run_id IN (${oldRuns})`, params: [at - checklists * SECOND] })
  unit.add({ sql: `DELETE FROM front_of_house_checklist_runs WHERE id IN (${oldRuns})`, params: [at - checklists * SECOND] })
  // An incident's personal data and free text, counted from closing; longer when a child was involved.
  const due = `SELECT i.id FROM front_of_house_incidents i WHERE i.state = 'closed' AND i.what_happened <> '${ERASED.redact}' AND i.closed_at < CASE
      WHEN EXISTS (SELECT 1 FROM front_of_house_incident_people p WHERE p.incident_id = i.id AND p.is_child = 1) THEN ? ELSE ? END`
  const cut = [at - child * SECOND, at - incidents * SECOND]
  unit.add({
    sql: `UPDATE front_of_house_incident_people SET name = CASE WHEN name IS NULL THEN NULL ELSE '${ERASED.anonymise}' END, contact = NULL, details = NULL, updated_at = ?
      WHERE incident_id IN (${due})`,
    params: [at, ...cut],
  })
  unit.add({
    // The log is append-only: the kit's trigger lets a body be cleared, never rewritten.
    sql: `UPDATE front_of_house_incident_updates SET body = NULL WHERE body IS NOT NULL AND incident_id IN (${due})`,
    params: cut,
  })
  unit.add({
    sql: `UPDATE front_of_house_incidents SET what_happened = '${ERASED.redact}', immediate_action = CASE WHEN immediate_action IS NULL THEN NULL ELSE '${ERASED.redact}' END,
        closing_note = '${ERASED.redact}', updated_at = ? WHERE id IN (${due})`,
    params: [at, ...cut],
  })
  // The merge stamp is cleared once Identity's undo window has closed.
  unit.add({
    sql: `UPDATE front_of_house_assignments SET freed_by_merge = NULL WHERE freed_by_merge IS NOT NULL
      AND freed_by_merge IN (SELECT id FROM core_account_merges WHERE undo_until < ?)`,
    params: [at],
  })
}

// ---------------------------------------------------------------------------------------------
// Erasure hold

/** An account listed on an incident that is not closed is not erased until it closes. */
export async function erasureHolds(accountId: string): Promise<string[]> {
  const open = await first<{ one: number }>(
    `SELECT 1 AS one FROM front_of_house_incident_people p JOIN front_of_house_incidents i ON i.id = p.incident_id
      WHERE p.account_id IN (${accountScopeSql('?1')}) AND i.state <> 'closed' LIMIT 1`, accountId)
  return open ? ['front-of-house.retain.incident'] : []
}

// ---------------------------------------------------------------------------------------------
// A person with no account (incident.redact-person)

/** Finds incident people with no account by name or contact, for a data request. The caller audits. */
export async function searchPeople(text: string) {
  const needle = `%${text.replace(/[%_\\]/g, m => `\\${m}`)}%`
  const rows = await all<{ id: string, incident_id: string, name: string | null, contact: string | null, year: number, number: number }>(
    `SELECT p.id, p.incident_id, p.name, p.contact, i.year, i.number FROM front_of_house_incident_people p JOIN front_of_house_incidents i ON i.id = p.incident_id
      WHERE p.account_id IS NULL AND (p.name LIKE ?1 ESCAPE '\\' OR p.contact LIKE ?1 ESCAPE '\\') ORDER BY i.year, i.number LIMIT 50`, needle) // not-policy: one screen of matches
  return rows.map(r => ({ personId: r.id, incidentId: r.incident_id, name: r.name, contact: r.contact, incident: `INC-${r.year}-${String(r.number).padStart(4, '0')}` })) // not-policy: the shown format
}

/** Redacts one person with no account: name anonymised, contact and welfare details cleared. */
export async function redactPerson(unit: UnitView, personId: string): Promise<void> {
  const row = await first<{ incident_id: string, account_id: string | null }>('SELECT incident_id, account_id FROM front_of_house_incident_people WHERE id = ?', personId)
  if (!row) refuse('core.not-found', 'There is no such person on an incident.', { status: 404 })
  if (row.account_id) refuse('front-of-house.person-has-account', 'This person has an account: their erasure reaches them through it.')
  unit.add({
    sql: `UPDATE front_of_house_incident_people SET name = '${ERASED.anonymise}', contact = NULL, details = NULL, updated_at = ? WHERE id = ? AND account_id IS NULL`,
    params: [nowMs(), personId],
  }).expect(1)
  unit.audit({ action: 'update', record: ['front-of-house.incident', row.incident_id], detail: { redacted: personId } })
}
