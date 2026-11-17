// A product's allergens as last recorded, and every check of its label, newest first.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { allergenHistory, answerFor } from '../../../../allergens'

export default defineRoute({
  ability: 'bar.allergens.manage',
  record: event => ['bar.product', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => ({
  answer: await answerFor({ productId: record!.id }),
  history: await allergenHistory({ productId: record!.id }),
}))
