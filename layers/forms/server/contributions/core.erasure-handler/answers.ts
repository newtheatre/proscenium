// Erasure of a person's answers (FB-601). The registry clears what a column's own class says:
// the response loses its person, address and key, and a sealed answer is emptied. An answer's
// readable columns are classed row by row, which the registry cannot express, so this does it:
// personal answers become a fixed marker, free text is removed, and public and internal answers
// stay. Unsent working copies go with the registry (the table deletes its rows). A response keyed to an address is found by that
// address when it is one of the person's own.
import { nowMs } from '#kit'
import { ERASED } from '#kit/db'
import { accountScopeSql } from '#kit/accounts'
import type { UnitView } from '#kit'
import { discardFileAnswers } from '../../files'

export default {
  async erase(unit: UnitView, subject: { accountId?: string, emails: string[] }) {
    const emails = JSON.stringify(subject.emails)
    const theirs = `SELECT id FROM forms_responses WHERE ${subject.accountId ? `person_id IN (${accountScopeSql('?1')}) OR ` : ''}(person_id IS NULL AND respondent_email IN (SELECT value FROM json_each(?2)))`
    const params = [subject.accountId ?? null, emails]
    // One statement for the files, one for the answers and one for the responses: an erasure is a single unit of
    // work with a limit on its statements, shared by every module.
    const erased = 'data_class IN (\'personal\', \'free-text\')'
    const gone = (column: string) => `${column} = CASE WHEN ${erased} THEN NULL ELSE ${column} END`
    // The files of the answers about to be emptied go at once, bytes and all, before those answers can no longer say which.
    unit.add({ sql: discardFileAnswers(theirs, '?3'), params: [...params, nowMs()] })
    unit.add({
      sql: `UPDATE forms_answers SET value_text = CASE WHEN value_text IS NULL THEN NULL WHEN data_class = 'personal' THEN '${ERASED.anonymise}' WHEN data_class = 'free-text' THEN '${ERASED.redact}' ELSE value_text END, ${['value_number', 'value_json', 'other_text', 'label_snapshot'].map(gone).join(', ')}, value_cipher = NULL WHERE (${erased} OR value_cipher IS NOT NULL) AND response_id IN (${theirs})`,
      params,
    })
    // A response keyed to an address has no account for the registry to find it by.
    unit.add({ sql: 'UPDATE forms_responses SET respondent_email = NULL, unique_key = NULL, calculated = NULL, score = NULL, passed = NULL, anonymised_at = ?3 WHERE person_id IS NULL AND respondent_email IN (SELECT value FROM json_each(?2))', params: [...params, nowMs()] })
  },
}
