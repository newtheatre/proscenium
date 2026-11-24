// The choices a product asks at the till, in order. Replaces what was attached.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setProductGroups } from '../../../../choices'

const MAX_GROUPS = 10 // not-policy: more choices than any drink asks

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.product', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ groupIds: z.array(z.string().min(1).max(64)).max(MAX_GROUPS) }).strict(), // not-policy: an id's length
}, async (_event, { input, record, unit }) => {
  setProductGroups(unit, record!.id, [...new Set(input.groupIds)])
  return { ok: true }
})
