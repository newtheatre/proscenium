// Sets a performance up for sale, or changes its set-up (BO-01, BO-04): the capacity of each band,
// the on-sale window, the order cap and the hold length.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { saveSales } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    pools: z.array(z.object({ bandId: idSchema('band'), capacity: z.number().int().min(0).max(100_000) }).strict()).max(50).optional(), // not-policy: bounds of the input's shape, not limits a theatre chooses
    onSaleAt: z.number().int().nullable().optional(),
    offSaleAt: z.number().int().nullable().optional(),
    maxPerOrder: z.number().int().min(1).max(500).nullable().optional(), // not-policy: the widest the desk cap setting allows
    holdMinutes: z.number().int().min(1).max(60).nullable().optional(), // not-policy: the widest the hold setting allows
    confirmOverVenue: z.boolean().optional(),
  }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  await saveSales(unit.view(), record!.id, input, actor)
  return { performanceId: record!.id }
})
