// Changes a choice: its name, whether it must be made, its usual pick, how a mixer is priced, or retires it.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { groupPatch, updateGroup } from '../../../../choices'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.choice-group', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: groupPatch,
}, async (_event, { input, record, unit }) => {
  await updateGroup(unit, record!.id, input)
  return { ok: true }
})
