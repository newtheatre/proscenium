// Merge two accounts (ID-32). Staff hold the ability over both, and neither may be their own.
import { z } from 'zod'
import { defineRoute, requireAbility } from '#kit'
import { mergeAccounts } from '../../../identity/merge'

export default defineRoute({
  ability: 'core.account.merge',
  rateLimit: 'write',
  input: z.object({ winnerId: z.string().max(40), loserId: z.string().max(40) }), // not-policy: ids are short
}, async (_event, { input, unit, actor }) => {
  await requireAbility(actor, 'core.account.merge', ['core.account', input.winnerId])
  await requireAbility(actor, 'core.account.merge', ['core.account', input.loserId])
  return { mergeId: await mergeAccounts(unit, actor, input) }
})
