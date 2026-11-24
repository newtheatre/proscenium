// Records a bank transfer or cheque received against an issued invoice (IE-13, I-21).
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { requireInvoice } from '../../../../invoices'
import { paymentFields, recordPayment } from '../../../../receipts'

export default defineRoute({
  ability: 'invoicing.payment.record',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: paymentFields,
}, async (_event, { record, input, unit, actor }) => {
  if (!actor.accountId) refuse('core.access.denied', 'Sign in to record a payment.', { status: 401 })
  const invoice = await requireInvoice(record!.id)
  return { invoiceId: invoice.id, ...(await recordPayment(unit, actor.accountId!, invoice, input)) }
})
