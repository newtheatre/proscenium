// Deletes a draft; an issued invoice is undone only by a credit note.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deleteDraft, requireInvoice } from '../../../invoices'

export default defineRoute({ ability: 'invoicing.invoice.draft', rateLimit: 'write', input: z.object({ version: z.number().int().min(0) }).strict() }, async (event, { input, unit }) => {
  deleteDraft(unit, await requireInvoice(getRouterParam(event, 'id')), input.version)
  return { deleted: true }
})
