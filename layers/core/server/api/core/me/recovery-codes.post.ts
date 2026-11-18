// Make a new set of recovery codes. The old set stops working (ID-14).
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { requireFresh, sessionOf } from '../../../identity/guards'
import { newRecoveryCodes, passkeyCount } from '../../../identity/passkeys'
import { credentialNotice } from '../../../identity/notices'
import { deviceLabel } from '../../../identity/web'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const session = await sessionOf(event)
  await requireFresh(actor)
  if (!(await passkeyCount(session.accountId))) refuse('core.passkey.none', 'Recovery codes come with a passkey.', { status: 409, remedy: 'Add a passkey first.' })
  const recoveryCodes = await newRecoveryCodes(unit, session.accountId)
  unit.audit({ action: 'update', record: ['core.account', session.accountId], detail: { recoveryCodes: recoveryCodes.length } })
  await credentialNotice(unit, session.accountId, 'recovery-codes', deviceLabel(event))
  return { recoveryCodes }
})
