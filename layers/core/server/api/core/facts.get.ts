// Every declared fact with the abilities mapped to it, and the abilities to choose from (ID-22).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { abilityCatalogue, factMappings } from '../../identity/facts'

export default defineRoute({ ability: 'core.role.read', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  return { facts: await factMappings(), catalogue: await abilityCatalogue(actor) }
})
