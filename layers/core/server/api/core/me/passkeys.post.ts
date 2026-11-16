// Add a passkey to my account. The first one comes with a set of recovery codes, shown once; the
// page asks for one to be typed back before it can be left (ID-03).
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { requireFresh, sessionOf } from '../../../identity/guards'
import { addPasskey, newRecoveryCodes, passkeyCount, verifyRegistration } from '../../../identity/passkeys'
import { deviceLabel } from '../../../identity/web'
import { reassert } from '../../../identity/sessions'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ challengeId: z.string().max(40), response: z.looseObject({ id: z.string() }), label: z.string().trim().max(60).optional() }), // not-policy: an id and a label are short
}, async (event, { input, unit, actor }) => {
  const session = await sessionOf(event)
  if (!session.limited) await requireFresh(actor)
  const credential = await verifyRegistration(unit, event, { challengeId: input.challengeId, purpose: 'register', response: input.response as any })
  if (credential.accountId !== session.accountId) refuse('core.passkey.challenge-stale', 'That took too long, or the page was used twice.', { status: 410, remedy: 'Try again.' })
  const first = (await passkeyCount(session.accountId)) === 0
  const id = addPasskey(unit, session.accountId, credential, input.label || deviceLabel(event))
  const recoveryCodes = first ? await newRecoveryCodes(unit, session.accountId) : undefined
  // Proving a new passkey is a strong proof, so this session is strong from now on.
  reassert(unit, session.id, 'passkey', true)
  unit.audit({ action: 'create', record: ['core.account', session.accountId], detail: { passkeyId: id } })
  return { passkeyId: id, recoveryCodes }
})
