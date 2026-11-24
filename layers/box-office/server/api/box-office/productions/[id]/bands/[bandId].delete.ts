// Removes a band nothing has been priced, held or sold in.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { getProduction } from '#modules/core'
import { deleteBand } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { record, unit }) => {
  await getProduction(record!.id)
  const bandId = getRouterParam(event, 'bandId', { decode: true }) ?? ''
  deleteBand(unit.view(), record!.id, bandId)
  return { bandId }
})
