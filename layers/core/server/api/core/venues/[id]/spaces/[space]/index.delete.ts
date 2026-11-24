// Deletes a space; never a venue's last (C-17).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { deleteSpace } from '../../../../../../places/service'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const id = getRouterParam(event, 'space', { decode: true }) ?? ''
  await deleteSpace(unit, record!.id, id)
  return { id }
})
