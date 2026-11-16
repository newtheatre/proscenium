// Setup, step 1: who the first Owner is, and the options for their passkey.
import { z } from 'zod'
import { defineRoute, newId } from '#kit'
import { registrationOptions } from '../../../identity/passkeys'
import { requireSetupNeeded, writeTicket } from '../../../identity/setup'
import { normaliseAddress } from '../../../identity/accounts'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ name: z.string().trim().min(1).max(120), address: z.email().max(254) }), // not-policy: the column's own lengths
}, async (event, { input, unit }) => {
  await requireSetupNeeded()
  const address = normaliseAddress(input.address)
  const userId = newId('acc')
  const { challengeId, options } = await registrationOptions(unit, event, { purpose: 'setup', accountId: null, userId, userName: address, displayName: input.name })
  await writeTicket(event, { name: input.name, address, userId, challengeId })
  return { options }
})
