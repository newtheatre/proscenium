// Changes an option of a choice, or retires it.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { optionPatch, updateOption } from '../../../../choices'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: optionPatch }, async (event, { input, unit }) => {
  await updateOption(unit, getRouterParam(event, 'id') ?? '', input)
  return { ok: true }
})
