// Sets a production's staging effects, each with an optional detail.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setEffects } from '../../../../programme/service'
import { effectsInput } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: effectsInput,
}, async (_event, { input, unit, record }) => {
  await setEffects(unit, record!.id, input.effects)
  return { id: record!.id }
})
