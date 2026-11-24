// Release a reservation by hand (R-6): the seats go back on sale and the buyer is told.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { releaseReservation } from '../../../../release'

export default defineRoute({
  ability: 'box-office.order.release',
  record: event => ['box-office.order', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await releaseReservation(unit.view(), record!.id!, 'staff')
  return { released: true }
})
