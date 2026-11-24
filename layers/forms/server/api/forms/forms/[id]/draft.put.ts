// Saves the draft as its author works (FB-201). The whole definition is sent with the revision it
// was edited from; a save from a stale revision is refused and says who saved last, so two people
// in one form never silently overwrite each other.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { accountName, getDraft, mayMark, parseOrRefuse, requireForm } from '../../../../forms'
import { keepAnswerKey, type Definition } from '../../../../../shared/engine'

const input = z.object({ definition: z.unknown(), editRevision: z.number().int().min(0) })

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'write', input }, async (_event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  if (form.archivedAt !== null) refuse('forms.form.archived', 'This form is archived, so it cannot be edited.', { status: 409, remedy: 'Restore it first.' })
  const sent = await parseOrRefuse(input.definition)
  const draft = await getDraft(form.id)
  // Somebody who may edit but not mark never sees the correct answers, so theirs are ignored and the draft's kept (FB-513).
  const definition = await mayMark(actor, form.id) ? sent : keepAnswerKey(sent, JSON.parse(draft.definition) as Definition)
  const stale = async () => {
    const who = draft.editedBy === actor.accountId ? 'you, in another window' : await accountName(draft.editedBy) ?? 'somebody else'
    return { code: 'forms.draft.stale', reason: `This form was saved by ${who} after you opened it.`, remedy: 'Reload to see their changes. Yours since then are not saved.' }
  }
  if (draft.editRevision !== input.editRevision) {
    const refusal = await stale()
    refuse(refusal.code, refusal.reason, { status: 409, remedy: refusal.remedy })
  }
  const at = nowMs()
  unit.add({
    sql: 'UPDATE forms_drafts SET definition = ?, format = ?, edit_revision = edit_revision + 1, edited_by = ?, updated_at = ? WHERE form_id = ? AND edit_revision = ?',
    params: [JSON.stringify(definition), definition.format, actor.accountId, at, form.id, input.editRevision],
  }).expect(1, { code: 'forms.draft.stale', reason: 'This form was saved by somebody else at the same moment.', remedy: 'Reload to see their changes. Yours since then are not saved.' })
  return { editRevision: input.editRevision + 1, updatedAt: at }
})
