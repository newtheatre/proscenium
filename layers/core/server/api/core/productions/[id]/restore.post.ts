// Brings a cancelled production back as withdrawn (part 3). Its performances stay cancelled.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { restoreProduction } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.production.cancel',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await restoreProduction(unit, record!.id)
  return { id: record!.id }
})
