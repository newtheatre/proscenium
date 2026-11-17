// Puts the ticket types in the order dragged on the Ticket types screen. The list names every type once.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { reorderTicketTypes } from '../../../ticket-types'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    ticketTypeIds: z.array(z.string().min(1).max(40)).min(1).max(200), // not-policy: far more types than any theatre keeps
  }).strict(),
}, async (_event, { input, unit }) => {
  reorderTicketTypes(unit.view(), input.ticketTypeIds)
  return { ticketTypeIds: input.ticketTypeIds }
})
