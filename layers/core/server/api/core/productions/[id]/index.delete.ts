// Deletes a draft production that was never published.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { deleteProduction } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await deleteProduction(unit, record!.id)
  return { id: record!.id }
})
