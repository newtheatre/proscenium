// Add an email address (ID-12). It needs a recent re-assertion, and does nothing until the link
// sent to it is used.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireFresh } from '../../../identity/guards'
import { addAddress } from '../../../identity/my-addresses'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ address: z.email().max(254) }).strict(), // not-policy: the longest address SMTP allows
}, async (event, { input, unit, actor }) => {
  await requireFresh(actor)
  return addAddress(unit, event, actor.accountId!, input.address)
})
