// Archives a space: gone from pickers, kept for the records that use it.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setSpaceArchived } from '../../../../../../places/service'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const id = getRouterParam(event, 'space') ?? ''
  await setSpaceArchived(unit, record!.id, id, true)
  return { id }
})
