// Copies the set-up of another performance onto this one (BO-02): bands, capacities, prices and
// limits; never sold tickets or holds.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, idSchema } from '#kit'
import { copySetup } from '../../../../../copy'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ fromPerformanceId: idSchema('perf'), confirmOverVenue: z.boolean().optional() }).strict(),
}, (_event, { input, record, actor, unit }) => copySetup(unit.view(), record!.id!, input.fromPerformanceId, actor, { confirmOverVenue: input.confirmOverVenue }))
