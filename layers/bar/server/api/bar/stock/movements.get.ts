// The latest stock movements, newest first, of one item or at one location.
import { getQuery } from 'h3'
import { defineRoute } from '#kit'
import { movements } from '../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.manage', rateLimit: 'default' }, async (event) => {
  const q = getQuery(event)
  const one = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : undefined // not-policy: an id's length
  return { movements: await movements({ stockItemId: one(q.item), locationId: one(q.location) }) }
})
