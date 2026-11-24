// Saves one set of a record's custom fields. The answers are checked as a sent form's are, and
// kept as a new revision beside the earlier ones. A save made from an older revision is refused.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { fieldsOf, mayEdit, saveFields } from '../../../../../records'
import { answersLimit } from '../../../../../responses'
import { requireSlot } from '../../../../../slots'
import type { Answers } from '../../../../../../shared/engine'

const input = z.object({
  answers: z.record(z.string().max(200), z.unknown()), // not-policy: shape bound
  revision: z.number().int().min(0),
})

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input }, async (event, { input, actor, unit }) => {
  const slot = await requireSlot(getRouterParam(event, 'slot', { decode: true }))
  const recordId = getRouterParam(event, 'record', { decode: true })!
  await mayEdit(actor, slot, recordId)
  const fields = (await fieldsOf(slot, recordId)).find(f => f.formId === getRouterParam(event, 'form', { decode: true }))
  if (!fields) return refuse('forms.record.not-attached', 'These fields are no longer here.', { status: 404, remedy: 'Reload the page.' }) // not-policy: HTTP status
  if (JSON.stringify(input.answers).length > await answersLimit()) return refuse('forms.response.too-large', 'These answers are too long to save.', { status: 413 }) // not-policy: HTTP status
  return saveFields(unit, { slot, recordId, fields, answers: input.answers as Answers, revision: input.revision, actor, at: nowMs() })
})
