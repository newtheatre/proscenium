// Credit notes out and write-offs (IE-15, IE-27; rules I-26 to I-28, I-44, I-45). A credit note is a
// numbered document from its own series, issued at once: it reverses the lines it names, VAT at each
// original line's rate, and is allocated against the invoice up to what is outstanding; any rest stays
// open on it as money to give back. A write-off posts the whole outstanding to bad debts. Neither is
// ever done by whoever issued the invoice, an Owner included (ruling R3-17).
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, can, first, newId, nowMs, refuse, today, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { previousDate } from '#kit/clock'
import { assertTerm } from '#modules/core'
import { postEntries, type EntryInput } from '#modules/finance'
import { lineTax } from '../shared/invoices'
import { linesOf, writeLines, type Invoice, type Worked } from './invoices'
import { formatMoney } from './money'
import { defaultSeries, takeNumber } from './series'

const REASONS = 'invoicing.write-off-reason'
const DAY = 86_400 // not-policy: seconds in a day
const changed = { code: 'invoicing.invoice.changed', reason: 'Someone else changed this invoice a moment ago.', remedy: 'Reload it and try again.' }

export const creditFields = z.object({
  lines: z.array(z.object({ lineId: z.string().min(1), netMinor: z.number().int().min(1) }).strict()).min(1).max(200), // not-policy: lines one invoice holds
  expectedTotalMinor: z.number().int().min(1),
}).strict()

export const writeOffFields = z.object({
  reasonTermId: z.string().min(1),
  expectedOutstandingMinor: z.number().int().min(1),
}).strict()

/** Refuses whoever issued the invoice, under any of their merged accounts. */
async function refuseIssuer(actor: Actor, invoice: Invoice, code: string, reason: string): Promise<void> {
  if (!actor.accountId || !invoice.issuedBy) return
  if (await first(`SELECT 1 AS same WHERE ? IN (${accountScopeSql('?2')})`, invoice.issuedBy, actor.accountId)) refuse(code, reason, { status: 403, remedy: 'Ask someone else who may.' })
}

/** What is left to credit: the total less every earlier credit note against it (I-27). */
export async function creditable(invoice: Invoice): Promise<number> {
  const earlier = await first<{ sum: number }>("SELECT coalesce(sum(total_minor), 0) AS sum FROM invoicing_invoices WHERE credits_id = ? AND kind = 'credit_note'", invoice.id)
  return invoice.totalMinor - (earlier?.sum ?? 0)
}

/** The credit note's lines: each named line's account, code and rate, for the net given, VAT at the original's rate. */
async function creditLines(invoice: Invoice, asked: z.infer<typeof creditFields>['lines']): Promise<Worked> {
  const originals = new Map((await linesOf(invoice.id)).map(l => [l.id, l]))
  const lines = asked.map((a, position) => {
    const line = originals.get(a.lineId)
    if (!line) refuse('invoicing.credit.line', 'That line is not on this invoice.', { status: 422 })
    if (a.netMinor > line!.netMinor) refuse('invoicing.credit.line-over', 'A line cannot be credited for more than it was.', { status: 422, fields: { [`lines.${position}.netMinor`]: 'invoicing.credit.line-over' } })
    const whole = a.netMinor === line!.netMinor
    return {
      position,
      description: line!.description,
      quantityMilli: whole ? line!.quantityMilli : 1000, // not-policy: a part amount is one of itself
      unitMinor: whole ? line!.unitMinor : a.netMinor,
      netMinor: a.netMinor,
      taxCode: line!.taxCode,
      taxRateBp: line!.taxRateBp,
      taxMinor: whole ? line!.taxMinor : lineTax(a.netMinor, line!.taxRateBp),
      accountId: line!.accountId,
      productionId: line!.productionId,
    }
  })
  return { lines, netMinor: lines.reduce((n, l) => n + l.netMinor, 0), taxMinor: lines.reduce((n, l) => n + l.taxMinor, 0) }
}

/** Issues a credit note against an issued invoice out (IE-15). */
export async function creditInvoice(unit: UnitView, actor: Actor, invoice: Invoice, input: z.infer<typeof creditFields>): Promise<{ creditNoteId: string, number: string }> {
  if (invoice.direction !== 'out' || invoice.kind !== 'invoice' || (invoice.state !== 'open' && invoice.state !== 'closed'))
    refuse('invoicing.credit.not-issued', 'Only an issued invoice can be credited.', { status: 409 })
  await refuseIssuer(actor, invoice, 'invoicing.credit.own', 'You issued this invoice, so someone else credits it.')
  const worked = await creditLines(invoice, input.lines)
  const total = worked.netMinor + worked.taxMinor
  const money = (minor: number) => formatMoney(minor, invoice.currency)
  if (total !== input.expectedTotalMinor)
    refuse('invoicing.credit.total-differs', `The credit shown was ${await money(input.expectedTotalMinor)} but it comes to ${await money(total)}.`, { status: 409, remedy: 'Reload it and check the total.' })
  const left = await creditable(invoice)
  const over = { code: 'invoicing.credit.over', reason: `Only ${await money(left)} of this invoice is left to credit.`, remedy: 'Credit less.' }
  if (total > left) refuse(over.code, over.reason, { status: 409, remedy: over.remedy })
  const series = await defaultSeries('credit_note')
  if (!series) refuse('invoicing.series.none', 'There is no credit note series to number it from.', { status: 409, remedy: 'Make one under Admin, Modules, Invoices.' })
  const number = await takeNumber(unit, series!.id)
  const id = newId('ivc')
  const at = nowMs()
  const on = await today()
  const allocated = invoice.state === 'open' ? Math.min(total, invoice.totalMinor - invoice.allocatedMinor) : 0
  // The predicate on the statement keeps two credit notes from together crediting more than the total.
  unit.add(sql`INSERT INTO invoicing_invoices (id, direction, kind, credits_id, series_id, number, party_module, party_id, party_account_id, bill_to_name, bill_to_address, bill_to_email,
      tax_number, seller_tax_number, reference, issue_on, due_on, currency, net_minor, tax_minor, total_minor, allocated_minor, state, reminders_on, created_by, issued_by, issued_at, created_at, updated_at)
    SELECT ${id}, 'out', 'credit_note', o.id, ${series!.id}, ${number}, o.party_module, o.party_id, o.party_account_id, o.bill_to_name, o.bill_to_address, o.bill_to_email,
      o.tax_number, o.seller_tax_number, o.reference, ${on}, ${on}, o.currency, ${worked.netMinor}, ${worked.taxMinor}, ${total}, ${allocated}, 'draft', 0, ${actor.accountId ?? null}, ${actor.accountId ?? null}, ${at}, ${at}, ${at}
    FROM invoicing_invoices o WHERE o.id = ${invoice.id}
      AND o.total_minor - (SELECT coalesce(sum(c.total_minor), 0) FROM invoicing_invoices c WHERE c.credits_id = o.id AND c.kind = 'credit_note') >= ${total}`).expect(1, over)
  writeLines(unit, id, worked)
  const postingId = await postEntries(unit, {
    key: `invoicing:credit-note:${id}:issue`,
    source: { module: 'invoicing', type: 'invoicing.invoice', id },
    kind: 'transfer',
    purpose: 'credit_note',
    currency: invoice.currency,
    postedBy: actor.accountId ?? undefined,
    occurredAt: at,
    entries: creditEntries(worked, total),
  })
  // Written as a draft so its lines could be written, then opened with its posting.
  unit.add({ sql: "UPDATE invoicing_invoices SET state = CASE WHEN allocated_minor = total_minor THEN 'closed' ELSE 'open' END, posting_id = ? WHERE id = ? AND state = 'draft'", params: [postingId, id] }).expect(1)
  if (allocated) allocate(unit, invoice, { kind: 'credit', amountMinor: allocated, creditNoteId: id, on, at, by: actor.accountId ?? null })
  unit.audit({ action: 'create', record: ['invoicing.invoice', id], detail: { kind: 'credit_note', creditsId: invoice.id, totalMinor: total } })
  unit.announce('invoicing.invoice.credited', { invoiceId: invoice.id, creditNoteId: id, amountMinor: total }, { record: ['invoicing.invoice', invoice.id] })
  unit.enqueue('invoicing.after-issue', { invoiceId: id, send: false, byId: actor.accountId ?? null })
  return { creditNoteId: id, number }
}

/** The reverse of issue (I-44): Dr each line's account its net with its code and VAT, Dr output VAT, Cr Debtors. */
function creditEntries(worked: Worked, total: number): EntryInput[] {
  const entries: EntryInput[] = []
  for (const line of worked.lines) if (line.netMinor) entries.push({ account: line.accountId!, amountMinor: line.netMinor, taxCode: line.taxCode, taxMinor: line.taxMinor, productionId: line.productionId })
  if (worked.taxMinor) entries.push({ account: { key: 'finance.vat-output' }, amountMinor: worked.taxMinor, forModule: 'finance' })
  entries.push({ account: { key: 'invoicing.receivable' }, amountMinor: -total })
  return entries
}

/** Raises what is allocated, predicated on what was read, closing the invoice when nothing is left. */
function allocate(unit: UnitView, invoice: Invoice, a: { kind: 'credit' | 'write_off', amountMinor: number, on: string, at: number, by: string | null, creditNoteId?: string, postingId?: string, reasonTermId?: string }): void {
  unit.add({
    sql: `UPDATE invoicing_invoices SET allocated_minor = allocated_minor + ?1, state = CASE WHEN allocated_minor + ?1 = total_minor THEN 'closed' ELSE state END, updated_at = ?2
      WHERE id = ?3 AND state = 'open' AND allocated_minor = ?4`, // not-policy: numbered parameters
    params: [a.amountMinor, a.at, invoice.id, invoice.allocatedMinor],
  }).expect(1, changed)
  const id = newId('iva')
  if (a.reasonTermId) {
    unit.add(sql`INSERT INTO invoicing_allocations (id, invoice_id, kind, amount_minor, posting_id, reason_term, on_date, by, created_at)
      SELECT ${id}, ${invoice.id}, ${a.kind}, ${a.amountMinor}, ${a.postingId ?? null}, ${a.reasonTermId}, ${a.on}, ${a.by}, ${a.at} WHERE ${assertTerm(a.reasonTermId, REASONS)}`)
      .expect(1, { code: 'invoicing.write-off.reason', reason: 'That reason is not on the list.', remedy: 'Choose a reason from the list.' })
    return
  }
  unit.add({
    sql: 'INSERT INTO invoicing_allocations (id, invoice_id, kind, amount_minor, credit_note_id, posting_id, on_date, by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, invoice.id, a.kind, a.amountMinor, a.creditNoteId ?? null, a.postingId ?? null, a.on, a.by, a.at],
  })
}

/** Whether an invoice is overdue long enough to write off, judged on `on` (I-26). */
export async function writeOffAllowedOn(invoice: Pick<Invoice, 'dueOn'>, on: string): Promise<boolean> {
  const wait = await useSetting('invoicing.write-off.min-overdue') as number
  return !!invoice.dueOn && previousDate(invoice.dueOn, -Math.floor(wait / DAY)) <= on && invoice.dueOn < on
}

/** Writes off what is outstanding (IE-27): Dr bad debts, Cr Debtors, VAT included (I-45). */
export async function writeOff(unit: UnitView, actor: Actor, invoice: Invoice, input: z.infer<typeof writeOffFields>): Promise<void> {
  if (invoice.direction !== 'out' || invoice.kind !== 'invoice' || invoice.state !== 'open') refuse('invoicing.write-off.not-open', 'Only an issued invoice with something outstanding can be written off.', { status: 409 })
  await refuseIssuer(actor, invoice, 'invoicing.write-off.own', 'You issued this invoice, so someone else writes it off.')
  const on = await today()
  if (!(await writeOffAllowedOn(invoice, on))) refuse('invoicing.write-off.too-soon', 'This invoice has not been overdue long enough to write off.', { status: 409 })
  const outstanding = invoice.totalMinor - invoice.allocatedMinor
  if (input.expectedOutstandingMinor !== outstanding)
    refuse('invoicing.write-off.differs', `The amount shown was ${await formatMoney(input.expectedOutstandingMinor, invoice.currency)} but ${await formatMoney(outstanding, invoice.currency)} is outstanding.`, { status: 409, remedy: 'Reload it and check the amount.' })
  const at = nowMs()
  const postingId = await postEntries(unit, {
    key: `invoicing:write-off:${invoice.id}:${invoice.allocatedMinor}`,
    source: { module: 'invoicing', type: 'invoicing.invoice', id: invoice.id },
    kind: 'transfer',
    purpose: 'write_off',
    currency: invoice.currency,
    postedBy: actor.accountId ?? undefined,
    occurredAt: at,
    entries: [{ account: { key: 'invoicing.bad-debts' }, amountMinor: outstanding }, { account: { key: 'invoicing.receivable' }, amountMinor: -outstanding }],
  })
  allocate(unit, invoice, { kind: 'write_off', amountMinor: outstanding, postingId, reasonTermId: input.reasonTermId, on, at, by: actor.accountId ?? null })
  unit.audit({ action: 'state', record: ['invoicing.invoice', invoice.id], detail: { from: 'open', to: 'closed', writtenOffMinor: outstanding } })
  unit.announce('invoicing.invoice.written-off', { invoiceId: invoice.id, amountMinor: outstanding }, { record: ['invoicing.invoice', invoice.id] })
}

/** What the viewer may do to an issued invoice beyond paying it, and the credit notes against it or that it is. */
export async function creditPowers(actor: Actor, invoice: Invoice) {
  const on = { type: 'invoicing.invoice', id: invoice.id }
  const issued = invoice.direction === 'out' && invoice.kind === 'invoice' && (invoice.state === 'open' || invoice.state === 'closed')
  const issuer = !!actor.accountId && !!invoice.issuedBy && !!(await first(`SELECT 1 AS same WHERE ? IN (${accountScopeSql('?2')})`, invoice.issuedBy, actor.accountId))
  const left = issued ? await creditable(invoice) : 0
  return {
    creditableMinor: left,
    canCredit: issued && left > 0 && !issuer && (await can(actor, 'invoicing.invoice.credit', on)).allowed,
    canWriteOff: issued && invoice.state === 'open' && !issuer && await writeOffAllowedOn(invoice, await today()) && (await can(actor, 'invoicing.invoice.write-off', on)).allowed,
    creditNotes: await all<{ id: string, number: string, totalMinor: number, issueOn: string }>(
      "SELECT id, number, total_minor AS totalMinor, issue_on AS issueOn FROM invoicing_invoices WHERE credits_id = ? AND kind = 'credit_note' ORDER BY created_at", invoice.id),
    credits: invoice.creditsId ? await first<{ id: string, number: string }>('SELECT id, number FROM invoicing_invoices WHERE id = ?', invoice.creditsId) : null,
  }
}
