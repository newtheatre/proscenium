// Deletes a draft season that no production belongs to.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { deleteSeason } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.season.manage',
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await deleteSeason(unit, id)
  return { id }
})
