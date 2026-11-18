// Erasure of a person's answers (FB-601). The registry clears what a column's own class says:
// the response loses its person, address and key, and a sealed answer is emptied. An answer's
// readable columns are classed row by row, which the registry cannot express, so this does it:
// personal answers become a fixed marker, free text is removed, and public and internal answers
// stay. Unsent working copies go altogether. A response keyed to an address is found by that
// address when it is one of the person's own.
import { ERASED } from '#kit/db'
import { accountScopeSql } from '#kit/accounts'
import type { ErasureHandler } from '../../../../core/server/points/erasure-handler'

export default {
  async erase(unit, subject) {
    const emails = JSON.stringify(subject.emails)
    const theirs = `SELECT id FROM forms_responses WHERE ${subject.accountId ? `person_id IN (${accountScopeSql('?1')}) OR ` : ''}(person_id IS NULL AND respondent_email IN (SELECT value FROM json_each(?2)))`
    const params = [subject.accountId ?? null, emails]
    const set = (marker: string) => `value_text = CASE WHEN value_text IS NULL THEN NULL ELSE '${marker}' END, value_number = NULL, value_json = NULL, other_text = NULL, label_snapshot = NULL`
    unit.add({ sql: `UPDATE forms_answers SET ${set(ERASED.anonymise)} WHERE data_class = 'personal' AND response_id IN (${theirs})`, params })
    unit.add({ sql: `UPDATE forms_answers SET ${set(ERASED.redact)} WHERE data_class = 'free-text' AND response_id IN (${theirs})`, params })
    unit.add({ sql: `UPDATE forms_answers SET value_cipher = NULL WHERE value_cipher IS NOT NULL AND response_id IN (${theirs})`, params })
    unit.add({ sql: `DELETE FROM forms_response_drafts WHERE response_id IN (${theirs})`, params })
    // A response keyed to an address has no account for the registry to find it by.
    unit.add({ sql: `UPDATE forms_responses SET respondent_email = NULL, unique_key = NULL, calculated = NULL, anonymised_at = ?3 WHERE person_id IS NULL AND respondent_email IN (SELECT value FROM json_each(?2))`, params: [...params, Date.now()] })
  },
} satisfies ErasureHandler
