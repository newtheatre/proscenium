// Sends a submitted count back to be counted again.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sendBack } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stocktake.approve',
  record: event => ['bar.stocktake', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await sendBack(unit, record!.id)
  return { ok: true }
})
