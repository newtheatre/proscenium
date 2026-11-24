// The seats of the whole run, set once on the production's Tickets tab (show walkthrough, decision
// 1): every performance that follows the run, or those named (for Undo). A night with seats of its
// own keeps them.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, idSchema, refuse } from '#kit'
import { getProduction } from '#modules/core'
import { setRunSeats } from '../../../../../run-setup'
import { listBands } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({
    pools: z.array(z.object({ bandId: idSchema('band'), capacity: z.number().int().min(0).max(100000) }).strict()).min(1).max(20), // not-policy: a sanity bound, as on a preset's sections
    performanceIds: z.array(idSchema('perf')).max(500).optional(), // not-policy: more performances than any run
    confirmOverVenue: z.boolean().optional(),
  }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  await getProduction(record!.id!)
  const bands = new Set((await listBands(record!.id!)).map(b => b.id))
  if (input.pools.some(p => !bands.has(p.bandId))) refuse('box-office.band.not-found', 'One of these sections does not belong to this production.', { status: 422 })
  return setRunSeats(unit.view(), record!.id!, input, actor)
})
