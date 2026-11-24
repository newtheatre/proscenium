// Finish a passkey sign-in. The session is strong (ID-02).
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { verifyAuthentication } from '../../../identity/passkeys'
import { accountById, isUsable } from '../../../identity/accounts'
import { startSession } from '../../../identity/sessions'
import { safeNext } from '../../../identity/web'

export default defineRoute({ practice: 'refuse',
  public: true,
  rateLimit: 'sign-in-network',
  input: z.object({ challengeId: z.string().max(40), response: z.looseObject({ id: z.string() }), next: z.string().max(512).optional() }), // not-policy: an id and a return path are short
}, async (event, { input, unit }) => {
  const { accountId } = await verifyAuthentication(unit, event, { challengeId: input.challengeId, purpose: 'sign_in', response: input.response as any })
  const account = await accountById(accountId)
  if (account?.disabled_at) refuse('core.account.disabled', 'This account is disabled.', { status: 403, remedy: 'Contact the theatre to find out why.' })
  if (!isUsable(account)) refuse('core.passkey.not-verified', 'That passkey could not be checked.', { status: 422, remedy: 'Try again, or sign in another way.' })
  await startSession(unit, event, { accountId, methods: ['passkey'], assurance: 'strong' })
  unit.audit({ action: 'sign-in', record: ['core.account', accountId], detail: { method: 'passkey' } })
  return { next: safeNext(input.next) ?? '/' }
})
