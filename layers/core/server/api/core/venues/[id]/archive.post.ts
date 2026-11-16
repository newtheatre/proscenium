// Archives a venue: gone from pickers and the public site, kept for the records that use it.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setVenueArchived } from '../../../../places/service'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await setVenueArchived(unit, record!.id, true)
  return { id: record!.id }
})
