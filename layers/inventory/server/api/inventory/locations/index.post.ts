// Adds a location, at the top or inside another (INV-07).
import { defineRoute } from '#kit'
import { addLocation } from '../../../locations'
import { locationInput } from '../../../inputs'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: locationInput,
}, async (_event, { input, unit }) => ({ locationId: await addLocation(unit.view(), input) }))
