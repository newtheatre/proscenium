// Adds a stock location, in a space or at a venue if given.
import { defineRoute } from '#kit'
import { addLocation, locationInput } from '../../../../stock'

export default defineRoute({ ability: 'bar.stock.manage', rateLimit: 'write', input: locationInput }, async (_event, { input, unit }) => ({ locationId: addLocation(unit, input) }))
