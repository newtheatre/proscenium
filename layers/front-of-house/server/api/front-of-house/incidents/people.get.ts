// The person picker on a report's Who step (IN-1): whoever can report an incident may find the people
// working the performance it is about, and nobody else (no performance, nobody: anyone else is named
// as free text). The same answer as the core's picker, a name and enough to tell two people apart,
// never contact details.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { workingPeople } from '../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.report',
  rateLimit: 'default',
  input: z.object({
    performance: z.string().min(1).max(40).optional(), // not-policy: shape bound
    q: z.string().trim().min(3).max(120), // not-policy: the picker asks after three letters
  }),
}, async (_event, { input }) => ({ people: input.performance ? await workingPeople(input.performance, input.q) : [] }))
