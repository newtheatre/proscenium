// Changes a ticket type: rename, reorder, retire or bring back any type, and, for a type a person
// made, who it is for. A type a module keeps refuses changes to its rules.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { ticketTypeId, updateTicketType } from '../../../ticket-types'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    name: z.string().trim().min(1).max(60).optional(), // not-policy: as on adding
    proofNote: z.string().trim().max(120).nullable().optional(), // not-policy: one line
    active: z.boolean().optional(),
    sort: z.number().int().min(0).max(999).optional(), // not-policy: an order, not a quantity
    kind: z.enum(['standard', 'concession']).optional(),
    requirementRefs: z.array(z.string().min(3).max(120)).max(10).optional(), // not-policy: as on adding
    maxPerHolder: z.number().int().min(1).max(50).optional(), // not-policy: as on adding
    recheckAtEntry: z.boolean().optional(),
    channel: z.enum(['all', 'desk', 'online']).optional(),
  }).strict(),
}, async (event, { input, unit }) => {
  const id = ticketTypeId(getRouterParam(event, 'id'))
  await updateTicketType(unit.view(), id, input)
  return { ticketTypeId: id }
})
