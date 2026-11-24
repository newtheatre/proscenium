// Submits a claim (BC-20): the claimant declares it true and for the theatre.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireClaim, submit } from '../../../../claims'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({ declared: z.literal(true) }).strict() }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  await submit(unit, actor, claim, input)
  return { claimId: claim.id }
})
