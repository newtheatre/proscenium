// Changes a venue's name, address or public text.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateVenue } from '../../../../places/service'
import { venuePatch } from '../../../../places/input'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: venuePatch,
}, async (_event, { input, unit, record }) => {
  await updateVenue(unit, record!.id, input)
  return { id: record!.id }
})
