// Adds a space to a venue (C-17).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addSpace } from '../../../../../places/service'
import { spaceInput } from '../../../../../places/input'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: spaceInput,
}, async (_event, { input, unit, record }) => {
  return { id: await addSpace(unit, record!.id, input) }
})
