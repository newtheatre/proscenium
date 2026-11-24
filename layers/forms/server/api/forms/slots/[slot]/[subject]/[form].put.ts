// Attaches a published form to a record in a slot, or changes its terms there: who may answer,
// when, how many and how often. The slot's own ability decides who may, on the record itself.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs } from '#kit'
import { requireForm } from '../../../../../forms'
import { attach, mayAttach, requireSlot } from '../../../../../slots'

const when = z.number().int().min(0).nullable()
const input = z.object({
  audience: z.enum(['anyone', 'signed_in']),
  opensAt: when,
  closesAt: when,
  responseCap: z.number().int().min(1).max(1_000_000).nullable(), // not-policy: only to keep the number sane
  onePerPerson: z.boolean(),
  status: z.enum(['active', 'paused']),
})

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input }, async (event, { input, actor, unit }) => {
  const slot = await requireSlot(getRouterParam(event, 'slot', { decode: true }))
  const subjectId = getRouterParam(event, 'subject', { decode: true })!
  await mayAttach(actor, slot, subjectId)
  const form = await requireForm(getRouterParam(event, 'form', { decode: true }))
  const placementId = await attach(unit, { slot, subjectId, form, terms: input, actor, at: nowMs() })
  return { placementId }
})
