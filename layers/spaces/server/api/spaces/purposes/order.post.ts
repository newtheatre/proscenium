// The order of purposes inside their tiers, by drag or keyboard.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { orderPurposes } from '../../../setup'

export default defineRoute({
  ability: 'spaces.purpose.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(200) }).strict(), // not-policy: shape bound
}, (_event, { input, unit }) => {
  orderPurposes(unit.view(), input.ids)
  return { ordered: input.ids.length }
})
