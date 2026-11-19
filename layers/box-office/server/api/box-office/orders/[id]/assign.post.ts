// Gives a booking nobody owns to a person (Matt, 19 November): picked from the people search or typed
// as an address. Nobody is emailed unless `send` asks for a paid booking's tickets to go to them.
// Who may change what a booking holds may say whose it is.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { assignBuyer } from '../../../../desk'
import { fromRequest } from '../../../../links'

export default defineRoute({
  ability: 'box-office.order.exchange',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    email: z.email().max(254).optional(), // not-policy: the longest address
    accountId: z.string().min(1).max(64).optional(), // not-policy: an id
    send: z.boolean().default(false),
  }).strict().refine(to => !!to.email !== !!to.accountId, { message: 'An address or a person, one of them.' }),
}, async (event, { input, record, unit }) => {
  await fromRequest(event)
  return assignBuyer(unit.view(), record!.id!, { email: input.email, accountId: input.accountId }, input.send)
})
