// Approves the approver's items of a claim, in whole or in part (BC-22, C1 to C3 and C5).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireClaim } from '../../../../claims'
import { approve } from '../../../../claim-decisions'
import { approval } from '../../../../claim-input'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: approval }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  return { claimId: claim.id, ...(await approve(unit, actor, claim, input)) }
})
