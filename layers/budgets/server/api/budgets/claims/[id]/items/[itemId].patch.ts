// Changes an item of a draft or returned claim.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireClaim, requireItem, updateItem } from '../../../../../claims'
import { itemFields } from '../../../../../claim-input'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: itemFields }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  const item = await requireItem(claim, getRouterParam(event, 'itemId'))
  await updateItem(unit, actor, { claim, item }, input)
  return { itemId: item.id }
})
