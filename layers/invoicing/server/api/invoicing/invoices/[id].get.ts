// S2: one invoice with its lines and what has been paid; a draft also gets what it may be written with.
import { getRouterParam } from 'h3'
import { all, defineRoute, first, today } from '#kit'
import { outsideAccounts } from '#modules/payments'
import { fileUrl } from '#modules/core'
import { draftChoices, linesOf, powersOn, requireInvoice, shownState } from '../../../invoices'
import { creditPowers } from '../../../credits'

async function pdfOf(invoiceId: string): Promise<string | null> {
  const row = await first<{ id: string | null }>('SELECT pdf_file_id AS id FROM invoicing_invoices WHERE id = ?', invoiceId)
  return row?.id ? fileUrl(row.id) : null
}

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
    pdfUrl: await pdfOf(invoice.id),
    sends: await all('SELECT id, step, created_at AS at FROM invoicing_reminders WHERE invoice_id = ? ORDER BY created_at', invoice.id),
    allocations: await all('SELECT id, kind, amount_minor AS amountMinor, on_date AS onDate, created_at AS createdAt FROM invoicing_allocations WHERE invoice_id = ? ORDER BY created_at', invoice.id),
    choices: powers.canEdit || powers.canIssue ? await draftChoices() : null,
    paymentAccounts: powers.canRecordPayment ? await outsideAccounts() : [],
    ...powers,
    ...(await creditPowers(actor, invoice)),
  }
})
