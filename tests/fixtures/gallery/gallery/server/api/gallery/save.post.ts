// A sample save for the form page. The schema is the one the page validates with, so the browser
// and the server say the same thing. A stale version is refused as a conflict.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { sampleSchema } from '../../sample-schema'

export default defineRoute({
  ability: 'gallery.sample.view',
  rateLimit: 'write',
  input: sampleSchema.extend({ version: z.coerce.string().optional() }),
}, async (_event, { input }) => {
  if (input.version === 'stale') refuse('gallery.conflict', 'Someone else saved this first.', { status: 409 })
  return { ok: true }
})
