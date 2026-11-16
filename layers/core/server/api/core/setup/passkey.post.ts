// Setup, step 2: the Owner's passkey. The recovery codes are made now and shown once.
import { z } from 'zod'
import { defineRoute, useSetting } from '#kit'
import { verifyRegistration } from '../../../identity/passkeys'
import { readTicket, requireSetupNeeded, writeTicket } from '../../../identity/setup'
import { randomRecoveryCode } from '../../../identity/crypto'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ response: z.looseObject({ id: z.string() }) }),
}, async (event, { input, unit }) => {
  await requireSetupNeeded()
  const ticket = await readTicket(event)
  const credential = await verifyRegistration(unit, event, { challengeId: ticket.challengeId, purpose: 'setup', response: input.response as any })
  const count = await useSetting('core.recovery.code-count') as number
  const codes = Array.from({ length: count }, () => randomRecoveryCode())
  const { accountId: _none, ...rest } = credential
  await writeTicket(event, { ...ticket, credential: rest, codes })
  return { recoveryCodes: codes }
})
