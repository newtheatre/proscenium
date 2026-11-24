// Remove my authenticator app. Needs a fresh confirmation. It is never the only way in, so nothing
// else is checked.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireFresh, sessionOf } from '../../../identity/guards'
import { removeAuthenticator } from '../../../identity/authenticator'

export default defineRoute({ practice: 'refuse', ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const session = await sessionOf(event)
  await requireFresh(actor)
  removeAuthenticator(unit, session.accountId)
  unit.audit({ action: 'delete', record: ['core.account', session.accountId], detail: { authenticator: true } })
  return { removed: true }
})
