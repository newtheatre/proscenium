// Takes a form away from a record. Nobody can answer it there any more; what was sent stays.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { detach, mayAttach, requireSlot } from '../../../../../slots'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { actor, unit }) => {
  const slot = await requireSlot(getRouterParam(event, 'slot'))
  const subjectId = getRouterParam(event, 'subject')!
  await mayAttach(actor, slot, subjectId)
  detach(unit, { slot, subjectId, formId: getRouterParam(event, 'form')! })
  return { ok: true }
})
