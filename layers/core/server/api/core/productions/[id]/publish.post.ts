// Publishes a production (C-03). Its dates are published one by one.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { publishProduction } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.production.publish',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await publishProduction(unit, record!.id)
  return { id: record!.id }
})
