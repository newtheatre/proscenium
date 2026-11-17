// Deletes a ticket type a person made that has never been priced or sold. Anything else is retired.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deleteTicketType, ticketTypeId } from '../../../ticket-types'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit }) => {
  deleteTicketType(unit.view(), ticketTypeId(getRouterParam(event, 'id')))
  return { deleted: true }
})
