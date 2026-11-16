// Who is signed in, in this browser. Anyone may ask; a signed-out browser is told so and nothing else.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { currentSession } from '../../identity/sessions'
import { describeMe } from '../../identity/me'

export default defineRoute({ public: true, rateLimit: 'default', input: z.object({}) }, async (event) => {
  const session = await currentSession(event)
  if (!session) return { signedIn: false }
  return describeMe(session)
})
