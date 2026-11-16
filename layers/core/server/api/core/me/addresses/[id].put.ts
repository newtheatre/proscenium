// Make a confirmed address the one the audience or members' side writes to (ID-12). The address it
// replaces is told.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { accountById } from '../../../../identity/accounts'
import { useAddressFor } from '../../../../identity/my-addresses'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ use: z.enum(['audience', 'members']) }).strict(),
}, async (event, { input, unit, actor }) => {
  await useAddressFor(unit, (await accountById(actor.accountId!))!, getRouterParam(event, 'id')!, input.use)
  return { ok: true }
})
