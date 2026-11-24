// A stock item's allergens as last recorded from its label, and every check of it, newest first.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { allergenHistory, answerFor } from '../../../../../allergens'

export default defineRoute({
  ability: 'bar.allergens.manage',
  record: event => ['bar.stock-item', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record }) => ({
  answer: await answerFor({ stockItemId: record!.id }),
  history: await allergenHistory({ stockItemId: record!.id }),
}))
