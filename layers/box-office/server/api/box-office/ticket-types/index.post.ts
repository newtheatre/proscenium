// Adds a ticket type: who a ticket is for. Site-wide, so reports compare like with like. A person
// makes ordinary types only; companion and complimentary types are kept by the modules that need them.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { createTicketType } from '../../../ticket-types'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    name: z.string().trim().min(1).max(60), // not-policy: a short name such as "Full price"
    kind: z.enum(['standard', 'concession']).default('standard'),
    proofNote: z.string().trim().max(120).nullish(), // not-policy: one line, such as "Bring student ID"
    requirementRefs: z.array(z.string().min(3).max(120)).max(10).optional(), // not-policy: a short list of alternatives
    maxPerHolder: z.number().int().min(1).max(50).optional(), // not-policy: the order cap's own ceiling
    recheckAtEntry: z.boolean().optional(),
    sort: z.number().int().min(0).max(999).optional(), // not-policy: an order, not a quantity
  }).strict(),
}, async (_event, { input, unit }) => ({ ticketTypeId: await createTicketType(unit.view(), input) }))
