// Retention (FB-602): a response is kept for the period its form sets, counted from the day it
// reached a final stage, and then anonymised. It stays as a row, so counts and the stages it
// passed through still read true, but it no longer says who sent it and its personal, free-text
// and special answers are gone, as an erasure would leave them. What staff wrote to the person, the
// reason for a decision and what reviewers wrote go too.
import { ERASED } from '#kit/db'
import { first, type UnitView } from '#kit'

const BATCH = 200 // not-policy: one run's share, to keep the unit small; the next run takes the rest

/** Anonymises a share of the responses whose time is up. Safe to run any number of times. */
export async function sweepRetention(unit: UnitView, at: number): Promise<number> {
  const due = `SELECT id FROM forms_responses WHERE retention_due_at <= ?1 AND anonymised_at IS NULL AND state <> 'draft' ORDER BY retention_due_at, id LIMIT ${BATCH}`
  const waiting = await first<{ n: number }>(`SELECT count(*) AS n FROM (${due})`, at)
  if (!waiting?.n) return 0
  const erased = 'data_class IN (\'personal\', \'free-text\')'
  const gone = (column: string) => `${column} = CASE WHEN ${erased} THEN NULL ELSE ${column} END`
  // The responses are marked last, so each statement before it still finds the same share.
  unit.add({
    sql: `UPDATE forms_answers SET value_text = CASE WHEN value_text IS NULL THEN NULL WHEN data_class = 'personal' THEN '${ERASED.anonymise}' WHEN data_class = 'free-text' THEN '${ERASED.redact}' ELSE value_text END, ${['value_number', 'value_json', 'other_text', 'label_snapshot'].map(gone).join(', ')}, value_cipher = NULL WHERE (${erased} OR value_cipher IS NOT NULL) AND response_id IN (${due})`,
    params: [at],
  })
  unit.add({ sql: `UPDATE forms_review_assignments SET scores = NULL, comment = NULL WHERE response_id IN (${due})`, params: [at] })
  unit.add({ sql: `UPDATE forms_responses SET person_id = NULL, respondent_email = NULL, unique_key = NULL, calculated = NULL, stage_note = NULL, decision_reason = NULL, anonymised_at = ?1 WHERE id IN (${due})`, params: [at] })
  return waiting.n
}
