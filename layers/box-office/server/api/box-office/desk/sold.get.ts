// What a till payment bought from Box office, for the panel the till shows once it is paid: the
// bookings it made or paid for, with their references and tickets.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deskSold } from '../../../desk'

export default defineRoute({
  ability: 'box-office.order.view',
  rateLimit: 'default',
  input: z.object({ intent: z.string().min(1).max(64) }), // not-policy: an id
}, async (_event, { input }) => ({ orders: await deskSold(input.intent) }))
