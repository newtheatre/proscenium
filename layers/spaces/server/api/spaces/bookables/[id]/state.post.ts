// Pauses, resumes, archives or restores a bookable (SP-12).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { bookableRow, setBookableState } from '../../../../setup'

export default defineRoute({
  ability: 'spaces.bookable.manage',
  record: event => ['spaces.bookable', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ to: z.enum(['active', 'paused', 'archived']) }).strict(),
}, async (event, { input, unit }) => {
  setBookableState(unit.view(), await bookableRow(getRouterParam(event, 'id')!), input.to)
  return { bookableId: getRouterParam(event, 'id'), state: input.to }
})
