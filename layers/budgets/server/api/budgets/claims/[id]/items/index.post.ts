// Adds an item to a draft or returned claim (BC-19).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addItem, requireClaim } from '../../../../../claims'
import { itemFields } from '../../../../../claim-input'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: itemFields }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  return { itemId: await addItem(unit, actor, claim, input) }
})
