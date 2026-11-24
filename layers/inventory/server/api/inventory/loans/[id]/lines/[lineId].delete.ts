// Takes a line off a loan that is not yet out; what it promised is free again (L7, L16).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { z } from 'zod'
import { removeLine } from '../../../../../lending'

export default defineRoute({
  ability: 'inventory.loan.approve',
  record: event => ['inventory.loan', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit }) => {
  removeLine(unit.view(), getRouterParam(event, 'id')!, getRouterParam(event, 'lineId')!)
  return { removed: true }
})
