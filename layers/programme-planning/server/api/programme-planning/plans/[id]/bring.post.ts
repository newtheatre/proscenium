// PP-02 and rule E2: bring an existing draft production of the season onto the board, already accepted.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { bringInput, bringProduction, requirePlan } from '../../../../plans'

export default defineRoute({
  ability: 'programme-planning.entry.manage',
  record: event => ['programme-planning.plan', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: bringInput,
}, async (_event, { input, record, unit }) => ({ entryId: await bringProduction(unit, await requirePlan(record!.id), input) }))
