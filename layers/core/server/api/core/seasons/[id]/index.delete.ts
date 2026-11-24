// Deletes a draft season that no production belongs to.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { deleteSeason } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.season.manage',
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  await deleteSeason(unit, id)
  return { id }
})
