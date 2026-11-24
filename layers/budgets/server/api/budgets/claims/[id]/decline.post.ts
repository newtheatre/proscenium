// Declines a claim with a note the claimant sees; nothing is posted (BC-23).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireClaim } from '../../../../claims'
import { reject } from '../../../../claim-decisions'
import { decisionNote } from '../../../../claim-input'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: decisionNote }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  await reject(unit, actor, claim, { ...input, decline: true })
  return { claimId: claim.id }
})
