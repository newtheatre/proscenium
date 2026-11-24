// The forms in a slot that this person could answer now, for a module's own screens to offer:
// awards shows "Nominate somebody" beside an award whose nominations are open. Nothing is said of
// a form the person cannot answer, so the list never tells anybody what they are shut out of.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs } from '#kit'
import { openIn, requireSlot } from '../../../../slots'

const input = z.object({ subject: z.string().max(64).optional() }) // not-policy: shape bound

export default defineRoute({ public: true, rateLimit: 'default', input }, async (event, { input, actor }) => {
  const slot = await requireSlot(getRouterParam(event, 'slot', { decode: true }))
  return { open: await openIn(slot, actor, nowMs(), input.subject) }
})
