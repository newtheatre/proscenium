// Sends a claim back to its claimant to change, with a note they see (BC-23).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireClaim } from '../../../../claims'
import { sendBack } from '../../../../claim-decisions'
import { decisionNote } from '../../../../claim-input'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: decisionNote }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  await sendBack(unit, actor, claim, input)
  return { claimId: claim.id }
})
