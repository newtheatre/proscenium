// Whether I told the theatre I am under 18, and the day I turn 18, or that staff recorded it (C-74).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { ageMarkerFor } from '../../../identity/age'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  return { marker: await ageMarkerFor(actor.accountId!) }
})
