// The promotions, with the kinds of item one can apply to and each kind's pickers, as the selling
// modules switched on describe them (promotions.target).
import { defineRoute } from '#kit'
import { formKinds, listPromotions } from '../../promotions'

export default defineRoute({
  ability: 'promotions.promotion.manage',
  rateLimit: 'default',
}, async () => ({ rows: await listPromotions(), kinds: await formKinds() }))
