// Issues a credit note against an issued invoice (IE-15); never by whoever issued it (I-27, R3-17).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireInvoice } from '../../../../invoices'
import { creditFields, creditInvoice } from '../../../../credits'

export default defineRoute({
  ability: 'invoicing.invoice.credit',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: creditFields,
}, async (_event, { record, input, unit, actor }) => creditInvoice(unit, actor, await requireInvoice(record!.id), input))
