// Break-glass, step 1: the secret and an Owner's address; the options for their new passkey (ID-09).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { ownerByAddress, requireRecoverySecret } from '../../../identity/owner-recovery'
import { registrationOptions } from '../../../identity/passkeys'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ secret: z.string().max(500), address: z.email().max(254) }), // not-policy: lengths that fit any secret and address
}, async (event, { input, unit }) => {
  await requireRecoverySecret(input.secret)
  const accountId = await ownerByAddress(input.address)
  return registrationOptions(unit, event, { purpose: 'owner_recovery', accountId, userId: accountId, userName: input.address, displayName: input.address })
})
