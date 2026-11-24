// Retires a purpose, or brings it back. A purpose in use is never deleted.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { purposeRow, setPurposeState } from '../../../../setup'

export default defineRoute({
  ability: 'spaces.purpose.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ to: z.enum(['active', 'retired']) }).strict(),
}, async (event, { input, unit }) => {
  setPurposeState(unit.view(), await purposeRow(getRouterParam(event, 'id')!), input.to)
  return { purposeId: getRouterParam(event, 'id'), state: input.to }
})
