// Every choice with its options, for the Choices set-up screen, with each hand-listed option's
// allergens when the viewer may record them.
import { can, defineRoute } from '#kit'
import { allergenAnswers } from '../../../allergens'
import { choiceGroups } from '../../../choices'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'default' }, async (_event, { actor }) => {
  const groups = await choiceGroups()
  const canAllergens = (await can(actor, 'bar.allergens.manage')).allowed
  const { options } = canAllergens ? await allergenAnswers() : { options: new Map() }
  return {
    groups,
    canAllergens,
    allergens: canAllergens ? Object.fromEntries(groups.flatMap(g => g.options.flatMap(o => o.optionId && options.has(o.optionId) ? [[o.optionId, options.get(o.optionId)!]] : []))) : {},
  }
})
