// Adds a ticket type: who a ticket is for. Site-wide, so reports compare like with like.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { createTicketType } from '../../../setup'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    name: z.string().trim().min(1).max(60), // not-policy: a short name such as "Full price"
    kind: z.enum(['standard', 'concession', 'companion', 'complimentary']).default('standard'),
    proofNote: z.string().trim().max(120).nullish(), // not-policy: one line, such as "Bring student ID"
    needsPaidTicket: z.boolean().optional(),
  }).strict(),
}, (_event, { input, unit }) => ({ ticketTypeId: createTicketType(unit.view(), input) }))
