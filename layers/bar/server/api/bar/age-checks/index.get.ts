// The refusals register (S15): the rows, the signatures above them, and whether descriptions are kept.
import { can, defineRoute, useSetting } from '#kit'
import { register, registerFilters, reviews } from '../../../age-checks'
import { outlets } from '../../../catalogue'

export default defineRoute({ ability: 'bar.age-check.view', rateLimit: 'default', input: registerFilters }, async (_event, { actor, input }) => ({
  rows: await register(input),
  reviews: await reviews(),
  outlets: (await outlets()).map(o => ({ id: o.id, name: o.name })),
  canReview: (await can(actor, 'bar.age-check.review')).allowed,
  describing: await useSetting('bar.age-check.description') as boolean,
}))
