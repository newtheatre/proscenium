// Switches a module on or off (F-16, F-17, F-18). Refusals name what is missing or what depends on it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setModuleEnabled } from '#kit/modules-store'

export default defineRoute({
  ability: 'core.modules.manage',
  record: event => ['core.module', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ on: z.boolean() }),
}, async (event, { input, unit, record }) => {
  await setModuleEnabled(unit, record!.id, input.on)
  return { moduleId: record!.id, on: input.on }
})
