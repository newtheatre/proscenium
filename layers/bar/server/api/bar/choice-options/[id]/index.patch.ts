// Changes an option of a choice, or retires it.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { optionPatch, updateOption } from '../../../../choices'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: optionPatch }, async (event, { input, unit }) => {
  await updateOption(unit, getRouterParam(event, 'id', { decode: true }) ?? '', input)
  return { ok: true }
})
