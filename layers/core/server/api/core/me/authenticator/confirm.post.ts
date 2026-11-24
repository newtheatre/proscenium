// Finish adding an authenticator app with the first code it shows. Every verified address is told.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../../identity/guards'
import { confirmAuthenticator } from '../../../../identity/authenticator'
import { credentialNotice } from '../../../../identity/notices'
import { deviceLabel } from '../../../../identity/web'

export default defineRoute({ practice: 'refuse',
  ability: 'signed-in',
  rateLimit: 'sign-in',
  input: z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict(), // not-policy: an app shows six digits
}, async (event, { input, unit }) => {
  const session = await sessionOf(event)
  await confirmAuthenticator(unit, session.accountId, input.code)
  unit.audit({ action: 'create', record: ['core.account', session.accountId], detail: { authenticator: true } })
  await credentialNotice(unit, session.accountId, 'authenticator', deviceLabel(event))
  return { added: true }
})
