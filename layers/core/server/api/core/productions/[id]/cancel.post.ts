// Cancels a whole production with a reason (part 3): its scheduled performances still to come are
// cancelled with it. Any module may refuse first.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { cancelProduction } from '../../../../programme/service'
import { cancelInput } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.production.cancel',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: cancelInput,
}, async (_event, { unit, record, input, actor }) => ({ id: record!.id, ...await cancelProduction(unit, record!.id, input, actor) }))
