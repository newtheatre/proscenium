// Break-glass, step 2: enrol the passkey on the Owner. Audited; the Owner then signs in with it.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { requireRecoverySecret } from '../../identity/owner-recovery'
import { addPasskey, verifyRegistration } from '../../identity/passkeys'

export default defineRoute({ practice: 'refuse',
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ secret: z.string().max(500), challengeId: z.string().max(40), response: z.looseObject({ id: z.string() }) }), // not-policy: lengths that fit any secret and id
}, async (event, { input, unit }) => {
  await requireRecoverySecret(input.secret)
  const credential = await verifyRegistration(unit, event, { challengeId: input.challengeId, purpose: 'owner_recovery', response: input.response as any })
  if (!credential.accountId) refuse('core.passkey.challenge-stale', 'That took too long, or the page was used twice.', { status: 410, remedy: 'Try again.' })
  const passkeyId = addPasskey(unit, credential.accountId, credential, 'Added by owner recovery')
  unit.audit({ action: 'core.owner-recovery.used', record: ['core.account', credential.accountId], detail: { passkeyId } })
  return { enrolled: true }
})
