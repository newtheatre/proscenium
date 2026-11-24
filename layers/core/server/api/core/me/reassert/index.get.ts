// How I may confirm it is me in place (ID-28): a passkey, or for a basic session on an account with
// no passkey, a code sent to my audience address (shown masked).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../../identity/guards'
import { waysToConfirm } from '../../../../identity/reassert'

export default defineRoute({ practice: 'refuse', ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (event) => {
  return waysToConfirm(await sessionOf(event))
})
