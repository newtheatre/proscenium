// Rewrites a draft whole (IE-08); refused once issued (I-14).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { draftFields } from '../../../../shared/invoices'
import { requireInvoice, updateDraft } from '../../../invoices'

export default defineRoute({ ability: 'invoicing.invoice.draft', rateLimit: 'write', input: draftFields.extend({ version: z.number().int().min(0) }) }, async (event, { input, unit }) => {
  const invoice = await requireInvoice(getRouterParam(event, 'id'))
  await updateDraft(unit, invoice, input)
  return { invoiceId: invoice.id }
})
