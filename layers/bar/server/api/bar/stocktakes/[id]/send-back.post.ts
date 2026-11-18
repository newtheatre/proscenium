// Sends a submitted count back to be counted again.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sendBack } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stocktake.approve',
  record: event => ['bar.stocktake', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await sendBack(unit, record!.id)
  return { ok: true }
})
