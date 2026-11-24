// What cancelling the production would touch, and the first module that refuses it, for the
// confirmation (part 3, "Changes with a wide reach").
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { productionCancelImpact } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: z.object({ kind: z.literal('cancel') }),
}, async (_event, { record, actor }) => productionCancelImpact(record!.id, actor))
