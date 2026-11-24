// The records a pinnable fact's mapping may be pinned to, for the facts screen's picker.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { pinChoices } from '../../../../identity/facts'

export default defineRoute({ ability: 'core.role.read', rateLimit: 'default', input: z.object({}) }, async (event) => {
  return { records: await pinChoices(getRouterParam(event, 'fact') ?? '') }
})
