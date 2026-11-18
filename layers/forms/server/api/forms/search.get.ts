// The command palette's search for responses (core.search-source): by reference, among the forms
// whose responses this person may read. Nothing anybody answered is searched, so the palette
// cannot be used to look for words in forms the person may not open.
import { getQuery } from 'h3'
import { all, can, defineRoute } from '#kit'

const MOST = 8 // not-policy: one palette group

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const q = String(getQuery(event).q ?? '').trim().slice(0, 40) // not-policy: shape bound
  if (q.length < 3) return { ids: [] } // not-policy: a reference is not guessed a letter at a time
  const found = await all<{ id: string, formId: string }>(
    'SELECT id, form_id AS formId FROM forms_responses WHERE state = \'submitted\' AND reference LIKE ?1 ESCAPE \'\\\' ORDER BY submitted_at DESC LIMIT 40', // not-policy: enough to fill a group after the ones not theirs fall out
    `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`)
  const may = new Map<string, boolean>()
  const ids: string[] = []
  for (const row of found) {
    if (!may.has(row.formId)) may.set(row.formId, (await can(actor, 'forms.response.read', ['forms.form', row.formId])).allowed)
    if (may.get(row.formId)) ids.push(row.id)
    if (ids.length === MOST) break
  }
  return { ids }
})
