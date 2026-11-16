// Start adding a passkey to my account. Needs a fresh re-assertion (ID-14), which a sign-in a
// moment ago is (ID-03, the offer after first signing in).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireFresh, sessionOf } from '../../../../identity/guards'
import { registrationOptions } from '../../../../identity/passkeys'
import { accountById, verifiedAddressesOf } from '../../../../identity/accounts'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const session = await sessionOf(event)
  if (!session.limited) await requireFresh(actor)
  const account = await accountById(session.accountId)
  const [address] = await verifiedAddressesOf(session.accountId)
  const label = account?.preferred_name || account?.name || address || session.accountId
  return registrationOptions(unit, event, { purpose: 'register', accountId: session.accountId, userId: session.accountId, userName: address ?? label, displayName: label })
})
