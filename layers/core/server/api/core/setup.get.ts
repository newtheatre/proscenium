// Does this site still need its first Owner (ID-37)?
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setupNeeded } from '../../identity/setup'

export default defineRoute({ public: true, rateLimit: 'default', input: z.object({}) }, async () => {
  return { needed: await setupNeeded() }
})
