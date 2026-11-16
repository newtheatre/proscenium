// Closures and public holidays in a window, for the Closures screen and the calendar (C-18), with
// the venues and spaces a new closure can cover.
import { z } from 'zod'
import { defineRoute, nowMs } from '#kit'
import { closuresBetween } from '../../../places/closures'
import { listVenues } from '../../../places/service'

const DAY = 86_400_000 // not-policy: milliseconds in a day

export default defineRoute({
  ability: 'core.closure.manage',
  rateLimit: 'default',
  input: z.object({
    from: z.coerce.number().int().optional(),
    to: z.coerce.number().int().optional(),
    venueId: z.string().optional(),
    spaceId: z.string().optional(),
  }),
}, async (_event, { input }) => {
  const from = input.from ?? nowMs() - DAY
  const to = input.to ?? from + 400 * DAY // not-policy: a year and a bit ahead, by default
  const rows = await closuresBetween(from, to, { venueId: input.venueId, spaceId: input.spaceId })
  const places = (await listVenues()).map(v => ({ id: v.id, name: v.name, spaces: v.spaces.filter(sp => !sp.archived).map(sp => ({ id: sp.id, name: sp.name })) }))
  return { rows, total: rows.length, places }
})
