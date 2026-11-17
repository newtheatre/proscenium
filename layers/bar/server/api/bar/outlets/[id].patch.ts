// Changes an outlet, or retires it. An outlet that has sold is retired, never deleted.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateOutlet } from '../../../catalogue'
import { outletPatch } from '../../../input'

export default defineRoute({
  ability: 'bar.outlet.manage',
  record: event => ['bar.outlet', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: outletPatch,
}, async (_event, { input, record, unit }) => {
  await updateOutlet(unit, record!.id, input)
  return { ok: true }
})
