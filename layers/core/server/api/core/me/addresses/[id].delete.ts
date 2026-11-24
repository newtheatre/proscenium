// Remove one of my addresses (ID-12): never the one the theatre writes to, never the last confirmed
// one, and only after a recent re-assertion. A confirmed address is told it was removed.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { accountById } from '../../../../identity/accounts'
import { requireFresh } from '../../../../identity/guards'
import { removeAddress } from '../../../../identity/my-addresses'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  await requireFresh(actor)
  await removeAddress(unit, (await accountById(actor.accountId!))!, getRouterParam(event, 'id', { decode: true })!)
  return { ok: true }
})
