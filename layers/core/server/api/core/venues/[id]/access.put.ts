// Sets the access features of a venue, or of one of its spaces, in the order given.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { setPlaceAccess } from '../../../../places/service'
import { placeAccessInput } from '../../../../places/input'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: placeAccessInput,
}, async (_event, { input, unit, record }) => {
  await setPlaceAccess(unit, record!.id, input.spaceId, input.features)
  return { id: record!.id }
})
