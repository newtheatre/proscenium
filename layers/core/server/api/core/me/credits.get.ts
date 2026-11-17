// My credits (part 5): each production the person is credited on, with the printed name, role and
// who sees it. Open to anyone signed in; someone with no credits gets an empty list.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { myCredits } from '../../../programme/credits'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  return { credits: await myCredits(actor.accountId!) }
})
