// Changes a production's details (C-02). A new web address keeps the old one as a redirect.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateProduction } from '../../../../programme/service'
import { productionPatch } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: productionPatch,
}, async (_event, { input, unit, record }) => {
  return { id: record!.id, changed: await updateProduction(unit, record!.id, input) }
})
