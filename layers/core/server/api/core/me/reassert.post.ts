// Confirm it is me with a passkey. The session becomes strong and fresh, so the action that asked
// can be sent again unchanged (ID-07, ID-28). An emailed link never does this.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../identity/guards'
import { verifyAuthentication } from '../../../identity/passkeys'
import { reassert } from '../../../identity/sessions'

export default defineRoute({ practice: 'refuse',
  ability: 'signed-in',
  rateLimit: 'sign-in',
  input: z.object({ challengeId: z.string().max(40), response: z.looseObject({ id: z.string() }) }), // not-policy: an id is short
}, async (event, { input, unit }) => {
  const session = await sessionOf(event)
  await verifyAuthentication(unit, event, { challengeId: input.challengeId, purpose: 'reassert', response: input.response as any })
  reassert(unit, session.id, 'passkey', true)
  unit.audit({ action: 'sign-in', record: ['core.account', session.accountId], detail: { method: 'passkey', reassert: true } })
  return { reasserted: true }
})
