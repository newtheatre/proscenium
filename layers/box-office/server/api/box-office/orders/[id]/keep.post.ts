// Mark a reservation to keep, for a known latecomer, so the release time passes it by; or unmark it.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { keepReservation } from '../../../../release'

export default defineRoute({
  ability: 'box-office.order.release',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ keep: z.boolean() }).strict(),
}, (_event, { input, record, unit }) => {
  keepReservation(unit.view(), record!.id!, input.keep)
  return { keep: input.keep }
})
