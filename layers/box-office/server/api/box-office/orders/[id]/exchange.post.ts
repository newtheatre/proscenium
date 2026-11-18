// Exchange tickets on an order for another performance, band or ticket type (BO-54), each line
// with its own band and ticket type, so a family's adults and children stay that. With
// `preview`, says what it would cost or give back and changes nothing. Refunding a cheaper
// exchange's difference needs box-office.order.refund as well.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, requireAbility } from '#kit'
import { exchangeLines, exchangeQuote } from '../../../../exchange'
import { fromRequest } from '../../../../links'

export default defineRoute({
  ability: 'box-office.order.exchange',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    performanceId: z.string().min(1).max(64), // not-policy: shape bound
    lines: z.array(z.object({
      lineId: z.string().min(1).max(64), // not-policy: shape bound
      bandId: z.string().min(1).max(64), // not-policy: shape bound
      ticketTypeId: z.string().min(1).max(64), // not-policy: shape bound
    }).strict()).min(1).max(50), // not-policy: more lines than any order holds
    preview: z.boolean().optional(),
  }).strict(),
}, async (event, { input, record, actor, unit }) => {
  const { preview, ...change } = input
  const quote = await exchangeQuote(record!.id!, change)
  if (preview) return quote
  if (quote.paid && quote.differenceMinor < 0) await requireAbility(actor, 'box-office.order.refund', ['box-office.order', record!.id!])
  // The message links to the booking, where the new tickets are.
  await fromRequest(event)
  return exchangeLines(unit.view(), record!.id!, { ...change, by: actor.accountId! })
})
