// Renames or moves a location; everything inside it moves with it.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { locationRow, updateLocation } from '../../../../locations'
import { locationInput } from '../../../../inputs'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: locationInput,
}, async (event, { input, unit }) => {
  await updateLocation(unit.view(), await locationRow(getRouterParam(event, 'id')!), input)
  return { locationId: getRouterParam(event, 'id') }
})
