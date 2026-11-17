// "Apply for someone" (ID-42): a name and an address; the account is found or made, and the
// reviewer is taken to the form to fill in with them. Nothing is sent until the form is.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { personToApplyFor } from '../../../identity/access-scheme'

export default defineRoute({
  ability: 'core.access-scheme.review',
  rateLimit: 'write',
  input: z.object({
    name: z.string().trim().min(1).max(200), // not-policy: a person's name
    address: z.email().max(254), // not-policy: the longest address SMTP allows
  }).strict(),
}, async (_event, { input, unit, actor }) => personToApplyFor(unit, actor, input))
