// Starts a production, as a draft (C-01).
import { defineRoute } from '#kit'
import { createProduction } from '../../../programme/service'
import { productionInput } from '../../../programme/input'

export default defineRoute({
  ability: 'core.production.create',
  rateLimit: 'write',
  input: productionInput,
}, async (_event, { input, unit, actor }) => {
  return { id: await createProduction(unit, input, actor.accountId ?? null) }
})
