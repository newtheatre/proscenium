// Saves the draft as its author works (FB-201). The whole definition is sent with the revision it
// was edited from; a save from a stale revision is refused and says who saved last, so two people
// in one form never silently overwrite each other.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { accountName, getDraft, parseOrRefuse, requireForm } from '../../../../forms'

const input = z.object({ definition: z.unknown(), editRevision: z.number().int().min(0) })

export default defineRoute({ ability: 'forms.form.edit', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'write', input }, async (_event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  if (form.archivedAt !== null) refuse('forms.form.archived', 'This form is archived, so it cannot be edited.', { status: 409, remedy: 'Restore it first.' })
  const definition = await parseOrRefuse(input.definition)
  const draft = await getDraft(form.id)
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
