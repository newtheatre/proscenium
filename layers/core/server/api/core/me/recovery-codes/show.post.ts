// Show my current recovery codes again, each marked used or not (ID-14). Seeing them is acting on a
// secret, so it needs a fresh confirmation that it is you, asked in place. A POST, because a check is
// never made when a page loads.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireFresh, sessionOf } from '../../../../identity/guards'
import { myRecoveryCodes } from '../../../../identity/passkeys'

export default defineRoute({ practice: 'refuse', ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const session = await sessionOf(event)
  await requireFresh(actor)
  const codes = await myRecoveryCodes(session.accountId)
  unit.audit({ action: 'read', record: ['core.account', session.accountId], detail: { recoveryCodes: codes.length } })
  return { codes }
})
