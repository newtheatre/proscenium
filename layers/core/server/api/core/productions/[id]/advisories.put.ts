// Sets a production's advisories, in order, each with an optional detail.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setAdvisories } from '../../../../programme/service'
import { advisoriesInput } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: advisoriesInput,
}, async (_event, { input, unit, record }) => {
  await setAdvisories(unit, record!.id, input.advisories)
  return { id: record!.id }
})
