// Writes off what is outstanding on an invoice overdue long enough (IE-27, I-26).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireInvoice } from '../../../../invoices'
import { writeOff, writeOffFields } from '../../../../credits'

export default defineRoute({
  ability: 'invoicing.invoice.write-off',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: writeOffFields,
}, async (_event, { record, input, unit, actor }) => {
  const invoice = await requireInvoice(record!.id)
  await writeOff(unit, actor, invoice, input)
  return { invoiceId: invoice.id }
})
