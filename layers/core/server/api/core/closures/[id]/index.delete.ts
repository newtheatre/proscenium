// Deletes a closure the theatre recorded. Public holidays come from the feed and stay.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { deleteClosure } from '../../../../places/closures'

export default defineRoute({
  ability: 'core.closure.manage',
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await deleteClosure(unit, id)
  return { id }
})
