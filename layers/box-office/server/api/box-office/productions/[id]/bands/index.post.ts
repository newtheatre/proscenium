// Adds a band to a production: a priced part of the house.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getProduction } from '#modules/core'
import { createBand } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    name: z.string().trim().min(1).max(60), // not-policy: a short name such as "Stalls"
    kind: z.enum(['standard', 'wheelchair', 'restricted_view']).default('standard'),
    sort: z.number().int().min(0).max(999).default(0), // not-policy: an order on the screen
  }).strict(),
}, async (_event, { input, record, unit }) => {
  await getProduction(record!.id)
  return { bandId: createBand(unit.view(), record!.id, input) }
})
