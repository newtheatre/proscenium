// Withdraws a claim not yet decided (BC-24).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireClaim, withdraw } from '../../../../claims'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  await withdraw(unit, actor, claim)
  return { claimId: claim.id }
})
