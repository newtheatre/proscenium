// Approve a complimentary request, which issues its tickets at once (BO-63). Never your own.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { approveComps } from '../../../../comps'
import { fromRequest } from '../../../../links'

export default defineRoute({
  ability: 'box-office.comp.approve',
  record: event => ['box-office.comp-request', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { record, unit }) => {
  // The tickets are sent with a link to them.
  await fromRequest(event)
  const { orderId, reference } = await approveComps(unit.view(), record!.id!)
  return { state: 'issued', orderId, reference }
})
