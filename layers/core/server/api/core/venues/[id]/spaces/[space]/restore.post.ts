// Brings an archived space back.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { setSpaceArchived } from '../../../../../../places/service'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const id = getRouterParam(event, 'space', { decode: true }) ?? ''
  await setSpaceArchived(unit, record!.id, id, false)
  return { id }
})
