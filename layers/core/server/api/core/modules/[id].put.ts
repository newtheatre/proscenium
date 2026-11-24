// Switches a module on or off (F-16, F-17, F-18). Refusals name what is missing or what depends on it.
// `withRequired` switches on, in the same unit, the required modules the person was shown and confirmed.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setModuleEnabled } from '#kit/modules-store'

export default defineRoute({
  ability: 'core.modules.manage',
  record: event => ['core.module', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ on: z.boolean(), withRequired: z.boolean().optional() }),
}, async (event, { input, unit, record }) => {
  const switched = await setModuleEnabled(unit, record!.id, input.on, { withRequired: input.withRequired })
  return { moduleId: record!.id, on: input.on, switched }
})
