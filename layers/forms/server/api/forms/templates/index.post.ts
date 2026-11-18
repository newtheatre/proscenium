// Saves a template for the whole theatre (FB-208): from a form as its draft stands now, or from a
// definition given whole, which is how a removed template is put back.
import { z } from 'zod'
import { defineRoute, nowMs, refuse, requireAbility } from '#kit'
import { TITLE_LENGTH, getDraft, parseOrRefuse, requireForm } from '../../../forms'
import { forTemplate, saveTemplate } from '../../../templates'

const input = z.object({
  name: z.string().trim().min(1).max(TITLE_LENGTH),
  description: z.string().trim().max(500).nullish(), // not-policy: shape bound
  formId: z.string().max(64).optional(), // not-policy: shape bound
  definition: z.unknown().optional(),
})

export default defineRoute({ ability: 'forms.template.manage', rateLimit: 'write', input }, async (_event, { input, actor, unit }) => {
  let definition
  if (input.formId) {
    const form = await requireForm(input.formId)
    // Its questions are read to make the copy, so the form must be one this person may edit.
    await requireAbility(actor, 'forms.form.edit', ['forms.form', form.id])
    definition = await parseOrRefuse(JSON.parse((await getDraft(form.id))!.definition))
  }
  else if (input.definition !== undefined) {
    definition = await parseOrRefuse(input.definition)
  }
  else {
    return refuse('forms.template.nothing', 'Say which form to save as a template.', { status: 422 }) // not-policy: HTTP status
  }
  const templateId = saveTemplate(unit, { name: input.name, description: input.description || null, definition: forTemplate(definition), actorId: actor.accountId!, at: nowMs(), from: input.formId })
  return { templateId }
})
