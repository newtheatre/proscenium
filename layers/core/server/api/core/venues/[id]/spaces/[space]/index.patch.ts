// Changes a space's name, kind, capacity, text, or whether the theatre runs it (R-36).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateSpace } from '../../../../../../places/service'
import { spacePatch } from '../../../../../../places/input'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: spacePatch,
}, async (event, { input, unit, record }) => {
  const id = getRouterParam(event, 'space') ?? ''
  await updateSpace(unit, record!.id, id, input)
  return { id }
})
