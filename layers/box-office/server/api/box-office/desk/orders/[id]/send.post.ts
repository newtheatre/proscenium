// Emails the tickets of a desk sale made with nobody's details, when the buyer asks after paying: to
// an address typed in, or to a person picked in the till's buyer box.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { sendDeskTickets } from '../../../../../desk'
import { fromRequest } from '../../../../../links'

export default defineRoute({
  // Selling is asked of the order's performance, once the order is read.
  ability: 'box-office.order.view',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    email: z.email().max(254).optional(), // not-policy: the longest address
    accountId: z.string().min(1).max(64).optional(), // not-policy: an id
  }).strict().refine(to => !!to.email !== !!to.accountId, { message: 'An address or a person, one of them.' }),
}, async (event, { input, record, unit }) => {
  await fromRequest(event)
  return sendDeskTickets(unit.view(), record!.id!, input)
})
