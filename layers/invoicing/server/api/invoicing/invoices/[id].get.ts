// S2: one invoice with its lines and what has been paid; a draft also gets what it may be written with.
import { getRouterParam } from 'h3'
import { all, defineRoute, today } from '#kit'
import { outsideAccounts } from '#modules/payments'
import { draftChoices, linesOf, powersOn, requireInvoice, shownState } from '../../../invoices'

export default defineRoute({
  ability: 'invoicing.invoice.view',
  record: event => ['invoicing.invoice', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const invoice = await requireInvoice(record!.id)
  const powers = await powersOn(actor, invoice)
  return {
    invoice: { ...invoice, ...shownState(invoice, await today()) },
    lines: await linesOf(invoice.id),
    allocations: await all('SELECT id, kind, amount_minor AS amountMinor, on_date AS onDate, created_at AS createdAt FROM invoicing_allocations WHERE invoice_id = ? ORDER BY created_at', invoice.id),
    choices: powers.canEdit || powers.canIssue ? await draftChoices() : null,
    paymentAccounts: powers.canRecordPayment ? await outsideAccounts() : [],
    ...powers,
  }
})
