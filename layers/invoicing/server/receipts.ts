// Money received against an invoice out (IE-13, IE-14; rules I-20 to I-23, I-25). The payment is
// Payments' (P-A2); this module adds the allocation, raises what is allocated with the predicate on
// the statement, and closes the invoice when nothing is left, all in Payments' batch.
import { z } from 'zod'
import { first, newId, nowMs, refuse, today, type UnitView } from '#kit'
import { recordReceived, type Part } from '#modules/payments'
import { formatMoney } from './money'
import { getInvoice, type Invoice } from './invoices'

const RECEIVABLE = { key: 'invoicing.receivable' }

export const paymentFields = z.object({
  amountMinor: z.number().int().min(1),
  providerAccountId: z.string().min(1),
  receivedOn: z.iso.date(),
  reference: z.string().trim().min(1).max(80), // not-policy: a bank reference's length
}).strict()

/** Records a bank transfer or cheque received (I-21); Payments settles it through this module's handler. */
export async function recordPayment(unit: UnitView, by: string, invoice: Invoice, input: z.infer<typeof paymentFields>): Promise<{ intentId: string }> {
  if (invoice.state !== 'open') refuse('invoicing.invoice.not-open', 'Only an issued invoice with something outstanding takes a payment.', { status: 409 })
  return recordReceived(unit, { owner: { module: 'invoicing', record: invoice.id }, amountMinor: input.amountMinor, providerAccountId: input.providerAccountId, receivedOn: input.receivedOn, reference: input.reference, by })
}

/** Payments' settle: allocate the part against the invoice, refusing more than is outstanding (I-22). */
export async function settlePart(unit: UnitView, part: Part) {
  const invoice = await getInvoice(part.record)
  if (!invoice || invoice.direction !== 'out' || invoice.state !== 'open') refuse('invoicing.invoice.not-open', 'This invoice is not waiting for a payment.', { status: 409 })
  const outstanding = invoice!.totalMinor - invoice!.allocatedMinor
  const over = { code: 'invoicing.payment.over', reason: `This is ${await formatMoney(part.amountMinor, part.currency)} but only ${await formatMoney(outstanding, part.currency)} is outstanding.`, remedy: 'Record what is outstanding, and give the rest back.' }
  if (part.amountMinor > outstanding) refuse(over.code, over.reason, { status: 409, remedy: over.remedy })
  const at = nowMs()
  unit.add({
    sql: `UPDATE invoicing_invoices SET allocated_minor = allocated_minor + ?1,
      state = CASE WHEN allocated_minor + ?1 = total_minor THEN 'closed' ELSE state END,
      pay_token_hash = CASE WHEN allocated_minor + ?1 = total_minor THEN NULL ELSE pay_token_hash END, updated_at = ?2
      WHERE id = ?3 AND state = 'open' AND allocated_minor + ?1 <= total_minor`, // not-policy: numbered parameters
    params: [part.amountMinor, at, invoice!.id],
  }).expect(1, over)
  unit.add({
    sql: "INSERT INTO invoicing_allocations (id, invoice_id, kind, amount_minor, intent_id, on_date, by, created_at) VALUES (?, ?, 'payment', ?, ?, ?, ?, ?)",
    params: [newId('iva'), invoice!.id, part.amountMinor, part.intentId, part.receivedOn ?? await today(), null, at],
  })
  unit.audit({ action: 'update', record: ['invoicing.invoice', invoice!.id], detail: { paidMinor: part.amountMinor } })
  if (part.amountMinor === outstanding) {
    unit.announce('invoicing.invoice.paid', { invoiceId: invoice!.id, sourceModule: invoice!.sourceModule, sourceType: invoice!.sourceType, sourceId: invoice!.sourceId }, { record: ['invoicing.invoice', invoice!.id] })
  }
  return [{ account: RECEIVABLE, amountMinor: -part.amountMinor }]
}

/** Payments gave money back or corrected a payment: a reversal row reopens the invoice (I-25). */
export async function reversePart(unit: UnitView, part: Part, refund: { id: string, amountMinor: number }) {
  const paid = await first<{ id: string, invoiceId: string }>("SELECT id, invoice_id AS invoiceId FROM invoicing_allocations WHERE intent_id = ? AND kind = 'payment'", part.intentId)
  if (!paid) throw new Error(`No payment allocation for intent ${part.intentId}`)
  const at = nowMs()
  unit.add({
    sql: "UPDATE invoicing_invoices SET allocated_minor = allocated_minor - ?, state = 'open', updated_at = ? WHERE id = ? AND allocated_minor >= ?",
    params: [refund.amountMinor, at, paid.invoiceId, refund.amountMinor],
  }).expect(1, { code: 'invoicing.payment.reverse-too-much', reason: 'More would be taken back than was paid against this invoice.' })
  unit.add({
    sql: "INSERT INTO invoicing_allocations (id, invoice_id, kind, amount_minor, reverses_id, on_date, by, created_at) VALUES (?, ?, 'reversal', ?, ?, ?, ?, ?)",
    params: [newId('iva'), paid.invoiceId, -refund.amountMinor, paid.id, await today(), null, at],
  })
  unit.audit({ action: 'update', record: ['invoicing.invoice', paid.invoiceId], detail: { reversedMinor: refund.amountMinor } })
  return [{ account: RECEIVABLE, amountMinor: refund.amountMinor }]
}
