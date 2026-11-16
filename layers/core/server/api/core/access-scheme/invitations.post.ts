// Invite somebody to apply (ID-42): a name and an address; the account is found or made, and the
// person is emailed a single-use link that signs them in and opens the form.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { inviteToApply } from '../../../identity/access-scheme'

export default defineRoute({
  ability: 'core.access-scheme.review',
  rateLimit: 'write',
  input: z.object({
    name: z.string().trim().min(1).max(200), // not-policy: a person's name
    address: z.email().max(254), // not-policy: the longest address SMTP allows
  }).strict(),
}, async (event, { input, unit, actor }) => inviteToApply(unit, event, actor, input))
