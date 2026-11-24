// Takes a line off a loan that is not yet out; what it promised is free again (L5, L7, L16).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { z } from 'zod'
import { requireGather } from '../../../../../loan-access'
import { loanOf, removeLine } from '../../../../../lending'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit, actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  await requireGather(actor, loan)
  removeLine(unit.view(), loan.id, getRouterParam(event, 'lineId')!)
  return { removed: true }
})
