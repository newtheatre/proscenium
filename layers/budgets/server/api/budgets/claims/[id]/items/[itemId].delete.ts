// Removes an item, and its receipts, from a draft or returned claim.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removeItem, requireClaim, requireItem } from '../../../../../claims'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  const item = await requireItem(claim, getRouterParam(event, 'itemId'))
  await removeItem(unit, actor, claim, item)
  return { itemId: item.id }
})
