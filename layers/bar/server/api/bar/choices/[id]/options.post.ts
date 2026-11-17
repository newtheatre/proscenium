// Adds an option to a choice listed by hand, with what it adds to the price.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addOption, optionInput } from '../../../../choices'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.choice-group', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: optionInput,
}, async (_event, { input, record, unit }) => ({ id: addOption(unit, record!.id, input) }))
