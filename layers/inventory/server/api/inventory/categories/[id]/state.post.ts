// Archives a category, or brings it back. One with items not yet disposed of stays (I8).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { categoryRow, setCategoryState } from '../../../../departments'
import { stateInput } from '../../../../inputs'

export default defineRoute({ ability: 'inventory.setup.manage', rateLimit: 'write', idempotent: true, input: stateInput }, async (event, { input, unit }) => {
  setCategoryState(unit.view(), await categoryRow(getRouterParam(event, 'id')!), input.to)
  return { state: input.to }
})
