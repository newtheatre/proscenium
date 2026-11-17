// Removes a credit.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { removeCredit } from '../../../../../../programme/credits'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  await removeCredit(unit, record!.id, getRouterParam(event, 'credit')!)
  return { id: record!.id }
})
