// Issuing an invoice out (IE-09, rules I-01, I-02, I-08, I-09, I-12, I-13, I-41, I-44): the series'
// next number, the frozen document and its posting in one batch. Dr Debtors the gross; Cr each line's
// account its net, carrying its VAT code and VAT; Cr Finance's output VAT account the VAT.
import { z } from 'zod'
import { nowMs, refuse, theatreTimeZone, today, useSetting, type Actor, type UnitView } from '#kit'
import { instantOfLocal, previousDate } from '#kit/clock'
import { postEntries, type EntryInput } from '#modules/finance'
import { dueFrom, linesOf, type Invoice } from './invoices'
import { formatMoney } from './money'
import { takeNumber } from './series'

const DAY = 86_400 // not-policy: seconds in a day

export const issueFields = z.object({
  version: z.number().int().min(0),
  // The gross the screen showed; a different figure on the server refuses quoting both (decision 0004).
  expectedTotalMinor: z.number().int().min(0),
  issueOn: z.iso.date().optional(),
}).strict()

/** Checks what issue needs before any statement is written. */
async function checkIssue(actor: Actor, invoice: Invoice, input: z.infer<typeof issueFields>): Promise<string> {
  if (invoice.state !== 'draft') refuse('invoicing.invoice.issued', 'This invoice has already been issued.', { status: 409 })
  const lines = await linesOf(invoice.id)
  if (!invoice.billToName || !lines.length) refuse('invoicing.invoice.incomplete', 'An invoice needs who it is to and at least one line before it is issued.', { status: 422 })
  if (invoice.totalMinor <= 0) refuse('invoicing.invoice.zero', 'An invoice for nothing cannot be issued.', { status: 422 })
  if (input.expectedTotalMinor !== invoice.totalMinor)
    refuse('invoicing.invoice.total-differs', `The total shown was ${await formatMoney(input.expectedTotalMinor, invoice.currency)} but the invoice comes to ${await formatMoney(invoice.totalMinor, invoice.currency)}.`, { status: 409, remedy: 'Reload it and check the total.' })
  const over = await useSetting('invoicing.issue.second-person-over') as number | null
  if (over !== null && invoice.totalMinor > over && invoice.createdBy && invoice.createdBy === actor.accountId)
    refuse('invoicing.invoice.second-person', `An invoice over ${await formatMoney(over, invoice.currency)} is issued by someone other than whoever wrote it.`, { status: 403, remedy: 'Ask another treasurer to issue it.' })
  if (await useSetting('finance.tax.registered') === true && typeof await useSetting('finance.tax.number') !== 'string')
    refuse('invoicing.tax-number-missing', 'A VAT invoice needs the theatre\'s VAT number.', { status: 409, remedy: 'Set it in Finance\'s settings.' })
  const on = await today()
  const issueOn = input.issueOn ?? on
  const back = await useSetting('invoicing.issue.backdate-limit') as number
  if (issueOn > on) refuse('invoicing.invoice.future', 'An invoice cannot be dated after today.', { status: 422, fields: { issueOn: 'invoicing.invoice.future' } })
  if (issueOn < previousDate(on, Math.floor(back / DAY))) refuse('invoicing.invoice.backdated', 'That date is further back than an invoice may be dated.', { status: 422, fields: { issueOn: 'invoicing.invoice.backdated' } })
  return issueOn
}

/** Issues a draft: numbered, frozen and posted, or nothing at all. */
export async function issue(unit: UnitView, actor: Actor, invoice: Invoice, input: z.infer<typeof issueFields>): Promise<{ number: string }> {
  const issueOn = await checkIssue(actor, invoice, input)
  const lines = await linesOf(invoice.id)
  const number = await takeNumber(unit, invoice.seriesId!)
  const at = nowMs()
  const entries: EntryInput[] = [{ account: { key: 'invoicing.receivable' }, amountMinor: invoice.totalMinor }]
  for (const line of lines) {
    if (!line.netMinor) continue
    entries.push({ account: line.accountId!, amountMinor: -line.netMinor, taxCode: line.taxCode, taxMinor: -line.taxMinor, productionId: line.productionId })
  }
  if (invoice.taxMinor) entries.push({ account: { key: 'finance.vat-output' }, amountMinor: -invoice.taxMinor, forModule: 'finance' })
  const postingId = await postEntries(unit, {
    key: `invoicing:invoice:${invoice.id}:issue`,
    source: { module: 'invoicing', type: 'invoicing.invoice', id: invoice.id },
    kind: 'transfer',
    purpose: 'invoice',
    currency: invoice.currency,
    occurredAt: issueOn === await today() ? at : instantOfLocal(issueOn, '12:00', await theatreTimeZone()), // not-policy: midday, safely inside the day
    entries,
  })
  const registered = await useSetting('finance.tax.registered') === true
  unit.add({
    sql: `UPDATE invoicing_invoices SET state = 'open', number = ?, issue_on = ?, due_on = ?, seller_tax_number = ?, posting_id = ?, issued_by = ?, issued_at = ?,
      version = version + 1, updated_at = ? WHERE id = ? AND state = 'draft' AND version = ? AND total_minor = ?`,
    params: [number, issueOn, await dueFrom(invoice, issueOn), registered ? await useSetting('finance.tax.number') : null, postingId, actor.accountId ?? null, at, at, invoice.id, input.version, input.expectedTotalMinor],
  }).expect(1, { code: 'invoicing.invoice.changed', reason: 'Someone else changed this invoice a moment ago.', remedy: 'Reload it and try again.' })
  unit.audit({ action: 'state', record: ['invoicing.invoice', invoice.id], detail: { from: 'draft', to: 'open', number, totalMinor: invoice.totalMinor } })
  unit.announce('invoicing.invoice.issued', { invoiceId: invoice.id, kind: 'invoice', totalMinor: invoice.totalMinor }, { record: ['invoicing.invoice', invoice.id] })
  return { number }
}
