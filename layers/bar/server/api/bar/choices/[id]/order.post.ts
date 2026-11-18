// Puts a hand-listed choice's options in a new order, as the till offers them.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { optionOrderInput, orderOptions } from '../../../../choices'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.choice-group', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: optionOrderInput,
}, async (_event, { input, record, unit }) => {
  await orderOptions(unit, record!.id, input.optionIds)
  return { ok: true }
})
