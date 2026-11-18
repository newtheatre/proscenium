// Sizes on sale whose labels are not all checked, on the bar managers' home card.
import { can, type Actor } from '#kit'
import { uncheckedSizes } from '../../allergen-chart'

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'bar.allergens.manage')).allowed) return 0
    return await uncheckedSizes()
  },
}
