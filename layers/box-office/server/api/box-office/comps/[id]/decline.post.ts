// Decline a complimentary request (BO-63). Never your own.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { closeComps, compById } from '../../../../comps'

export default defineRoute({
  ability: 'box-office.comp.approve',
  record: event => ['box-office.comp-request', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  const request = await compById(record!.id!)
  if (!request) refuse('box-office.comp.not-found', 'There is no such request.', { status: 404 })
  await closeComps(unit.view(), request, 'declined')
  return { state: 'declined' }
})
