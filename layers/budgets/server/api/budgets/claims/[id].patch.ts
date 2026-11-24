// Changes a draft or returned claim's title or the request it fulfils.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireClaim, updateClaim } from '../../../claims'
import { claimFields } from '../../../claim-input'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: claimFields }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  await updateClaim(unit, actor, claim, input)
  return { claimId: claim.id }
})
