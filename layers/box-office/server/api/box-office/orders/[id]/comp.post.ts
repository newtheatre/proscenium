// Make a reservation not yet paid for complimentary, keeping its seats: a request for its tickets,
// issued at once or waiting for an approver as the theatre's setting says. Needs `box-office.comp.request` on its performance.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { requestReservationComps } from '../../../../comps'

export default defineRoute({
  ability: 'box-office.order.view',
  record: event => ['box-office.order', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ reasonTermId: z.string().min(1).max(64) }).strict(), // not-policy: shape bound
}, async (_event, { input, record, unit }) => requestReservationComps(unit.view(), record!.id!, input.reasonTermId))
