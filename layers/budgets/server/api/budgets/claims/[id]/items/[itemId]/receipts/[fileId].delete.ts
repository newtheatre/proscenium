// Removes a receipt from an item of a draft or returned claim.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removeReceipt, requireClaim, requireItem } from '../../../../../../../claims'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  const item = await requireItem(claim, getRouterParam(event, 'itemId'))
  await removeReceipt(unit, actor, { claim, item }, getRouterParam(event, 'fileId') ?? '')
  return { itemId: item.id }
})
