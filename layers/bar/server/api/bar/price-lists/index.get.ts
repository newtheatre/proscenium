// The price lists, with every size's price on each (S12).
import { defineRoute } from '#kit'
import { catalogue, ensureStandard, standardId } from '../../../catalogue'

export default defineRoute({ ability: 'bar.price.manage', rateLimit: 'default' }, async (_event, { unit }) => {
  // Standard is made by a listener when the bar is switched on; until that has run, make it here.
  if (!await standardId()) {
    ensureStandard(unit)
    await unit.commit()
  }
  return await catalogue()
})
