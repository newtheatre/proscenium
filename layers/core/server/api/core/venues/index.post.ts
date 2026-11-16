// Adds a venue, with one space of the same name (C-16).
import { defineRoute } from '#kit'
import { createVenue } from '../../../places/service'
import { venueInput } from '../../../places/input'

export default defineRoute({
  ability: 'core.venue.manage',
  rateLimit: 'write',
  input: venueInput,
}, async (_event, { input, unit }) => {
  return await createVenue(unit, input)
})
