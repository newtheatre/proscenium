// Ask for complimentary tickets (BO-62): how many, in which band, for whom and why. Needs
// `box-office.comp.request` on the performance.
import { z } from 'zod'
import { defineRoute, requireAbility } from '#kit'
import { requestComps } from '../../../comps'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({
    performanceId: z.string().min(1).max(64), // not-policy: shape bound
    bandId: z.string().min(1).max(64), // not-policy: shape bound
    quantity: z.number().int().min(1).max(50), // not-policy: shape bound; the setting is the limit
    email: z.string().trim().email().max(254), // not-policy: the longest address there is
    name: z.string().trim().max(120).optional(), // not-policy: shape bound
    reasonTermId: z.string().min(1).max(64), // not-policy: shape bound
  }).strict(),
}, async (_event, { input, actor, unit }) => {
  await requireAbility(actor, 'box-office.comp.request', ['core.performance', input.performanceId])
  return requestComps(unit.view(), input)
})
