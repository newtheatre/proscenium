// The reviewers' queue (ID-40): open applications and changes, oldest first, with the person's name
// and how long each has waited. No needs are shown until one is opened.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { reviewQueue } from '../../../identity/access-scheme'

export default defineRoute({ ability: 'core.access-scheme.read', rateLimit: 'default', input: z.object({}) }, async () => {
  return { applications: await reviewQueue() }
})
