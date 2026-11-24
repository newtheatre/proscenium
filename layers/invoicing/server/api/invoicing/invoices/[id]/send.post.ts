// Sends an issued invoice by hand: the invoice itself if it never went, otherwise a reminder (I-17, I-35).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { requireInvoice } from '../../../../invoices'
import { sendByHand } from '../../../../sending'

export default defineRoute({
  ability: 'invoicing.invoice.issue',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit, actor }) => {
  if (!actor.accountId) refuse('core.access.denied', 'Sign in to send an invoice.', { status: 401 })
  return { step: await sendByHand(unit, await requireInvoice(record!.id), actor.accountId!) }
})
