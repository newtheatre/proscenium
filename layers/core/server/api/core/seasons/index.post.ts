// Adds a season, as a draft.
import { defineRoute } from '#kit'
import { createSeason } from '../../../programme/service'
import { seasonInput } from '../../../programme/input'

export default defineRoute({
  ability: 'core.season.manage',
  rateLimit: 'write',
  input: seasonInput,
}, async (_event, { input, unit }) => {
  return { id: await createSeason(unit, input) }
})
