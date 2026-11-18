// Does this site still need its first Owner (ID-37)? While it does, the lists setup's theatre step
// chooses from come too, so the page needs nothing that asks for a signed-in person.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { catalogueValues } from '#kit/catalogues'
import { setupNeeded } from '../../identity/setup'

export default defineRoute({ public: true, rateLimit: 'default', input: z.object({}) }, async () => {
  if (!await setupNeeded()) return { needed: false }
  return { needed: true, timeZones: catalogueValues('time-zone'), countries: catalogueValues('country') }
})
