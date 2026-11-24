// Issues a draft: numbered, frozen and posted in one batch (IE-09).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireInvoice } from '../../../../invoices'
import { issue, issueFields } from '../../../../issue'

export default defineRoute({
  ability: 'invoicing.invoice.issue',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: issueFields,
}, async (_event, { record, input, unit, actor }) => {
  const invoice = await requireInvoice(record!.id)
  return { invoiceId: invoice.id, ...(await issue(unit, actor, invoice, input)) }
})
