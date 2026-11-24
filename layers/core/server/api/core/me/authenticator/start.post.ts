// Start adding an authenticator app: a new secret, shown once as a QR code and as text, waiting for
// its first code. Offered to people whose roles reach the console. Needs a fresh confirmation.
import { z } from 'zod'
import { defineRoute, useSetting } from '#kit'
import { requireFresh, sessionOf } from '../../../../identity/guards'
import { startAuthenticator } from '../../../../identity/authenticator'
import { addressFor } from '../../../../identity/addresses'
import { relyingParty } from '../../../../identity/web'

export default defineRoute({ practice: 'refuse', ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const session = await sessionOf(event)
  await requireFresh(actor)
  // What the app lists the entry under: the theatre's name, else the site's host; and the person's address.
  const site = (await useSetting('core.site.name') as string | null) || (await relyingParty(event)).id
  const account = (await addressFor(session.accountId, 'audience')) ?? session.accountId
  return startAuthenticator(unit, session.accountId, { site, account })
})
