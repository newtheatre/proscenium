// The catalogue for the Products screen (S11): categories, products, sizes and their prices on every list.
import { defineRoute } from '#kit'
import { catalogue, ensureStandard, standardId } from '../../catalogue'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'default' }, async (_event, { unit }) => {
  // Standard is made by a listener when the bar is switched on; until that has run, make it here.
  if (!await standardId()) {
    ensureStandard(unit)
    await unit.commit()
  }
  return await catalogue()
})
