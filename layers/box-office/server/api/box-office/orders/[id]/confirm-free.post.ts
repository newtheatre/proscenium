// Confirm a reservation with nothing left to pay, such as after a swap to a free ticket, without the till's payment.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { confirmFreeReservation } from '../../../../desk'
import { fromRequest } from '../../../../links'

export default defineRoute({
  ability: 'box-office.order.take-payment',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ admit: z.boolean().optional() }).strict(),
}, async (event, { input, record, unit }) => {
  // The message links to the booking, where the tickets are.
  await fromRequest(event)
  return confirmFreeReservation(unit.view(), record!.id!, input.admit ?? false)
})
