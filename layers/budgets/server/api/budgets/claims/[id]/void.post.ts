// Voids an approved, unpaid claim (BC-25): the treasurer; the expense posting is reversed.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireClaim } from '../../../../claims'
import { voidClaim } from '../../../../claim-decisions'
import { decisionNote } from '../../../../claim-input'

export default defineRoute({ ability: 'budgets.claim.approve-any', rateLimit: 'write', input: decisionNote }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  await voidClaim(unit, actor, claim, input)
  return { claimId: claim.id }
})
