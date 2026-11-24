// The season's draft productions not yet on the board, for "Bring onto the board".
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { bringable, requirePlan } from '../../../../plans'

export default defineRoute({
  ability: 'programme-planning.entry.manage',
  record: event => ['programme-planning.plan', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => ({ productions: await bringable(await requirePlan(record!.id)) }))
