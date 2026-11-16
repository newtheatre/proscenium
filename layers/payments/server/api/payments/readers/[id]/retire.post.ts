// Stops offering a card reader at the till.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { retireReader } from '../../../../readers'

export default defineRoute({
  ability: 'payments.provider.manage',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { unit }) => {
  await retireReader(unit.view(), getRouterParam(event, 'id') ?? '')
  return { retired: true }
})
