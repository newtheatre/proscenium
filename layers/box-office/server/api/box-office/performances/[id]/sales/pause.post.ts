// Pauses sales (BO-05): new baskets are refused; baskets already open can still be paid.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { pauseSales } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, (_event, { record, unit }) => {
  pauseSales(unit.view(), record!.id)
  return { state: 'paused' }
})
