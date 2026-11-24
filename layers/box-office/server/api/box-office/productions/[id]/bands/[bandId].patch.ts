// Renames a production's band, or changes its kind.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { getProduction } from '#modules/core'
import { updateBand } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({
    name: z.string().trim().min(1).max(60).optional(), // not-policy: a short name such as "Stalls"
    kind: z.enum(['standard', 'wheelchair', 'restricted_view']).optional(),
  }).strict(),
}, async (event, { input, record, unit }) => {
  await getProduction(record!.id)
  const bandId = getRouterParam(event, 'bandId', { decode: true }) ?? ''
  updateBand(unit.view(), record!.id, bandId, input)
  return { bandId }
})
