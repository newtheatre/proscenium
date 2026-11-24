// Withdraws a published production from the public site.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { withdrawProduction } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.production.publish',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await withdrawProduction(unit, record!.id)
  return { id: record!.id }
})
