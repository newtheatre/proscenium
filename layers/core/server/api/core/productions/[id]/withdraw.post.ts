// Withdraws a published production from the public site.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { withdrawProduction } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.production.publish',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await withdrawProduction(unit, record!.id)
  return { id: record!.id }
})
