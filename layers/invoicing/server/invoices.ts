// Invoices out (IE-08, IE-09, IE-31): a draft with a party and lines, worked out on the server, then
// issued in one batch that takes the series' number, freezes the document and posts it (I-12, I-13).
// Every change to a draft is predicated on state = 'draft' and the draft's version (I-14).
import { all, can, first, newId, nowMs, refuse, today, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { previousDate } from '#kit/clock'
import { accountLabel } from '#modules/core'
import { accountsOf, listTaxCodes } from '#modules/finance'
import { draftFields, lineNet, lineTax, type DraftInput } from '../shared/invoices'
import { lines as lineTable } from './db/schema'
import { defaultSeries } from './series'

export type InvoiceState = 'draft' | 'submitted' | 'open' | 'closed'

export interface Invoice {
  id: string
  direction: 'out' | 'in'
  kind: 'invoice' | 'credit_note'
  creditsId: string | null
  seriesId: string | null
  number: string | null
  partyModule: string | null
  partyId: string | null
  billToName: string
  billToAddress: string
  billToEmail: string | null
  taxNumber: string
  sellerTaxNumber: string | null
  reference: string
  issueOn: string | null
  dueOn: string | null
  suppliedOn: string | null
  currency: string
  netMinor: number
  taxMinor: number
  totalMinor: number
  allocatedMinor: number
  state: InvoiceState
  notes: string
  internalNote: string
  sourceModule: string | null
  sourceType: string | null
  sourceId: string | null
  postingId: string | null
  version: number
  createdBy: string | null
  issuedBy: string | null
  issuedAt: number | null
  createdAt: number
}

export interface Line {
  id: string
  position: number
  description: string
  quantityMilli: number
  unitMinor: number
  netMinor: number
  taxCode: string
  taxMinor: number
  taxRateBp: number
  accountId: string | null
  ownerKey: string | null
  productionId: string | null
}

export const COLUMNS = `i.id, i.direction, i.kind, i.credits_id AS creditsId, i.series_id AS seriesId, i.number, i.party_module AS partyModule,
  i.party_id AS partyId, i.bill_to_name AS billToName, i.bill_to_address AS billToAddress, i.bill_to_email AS billToEmail,
  i.tax_number AS taxNumber, i.seller_tax_number AS sellerTaxNumber, i.reference, i.issue_on AS issueOn, i.due_on AS dueOn,
  i.supplied_on AS suppliedOn, i.currency, i.net_minor AS netMinor, i.tax_minor AS taxMinor, i.total_minor AS totalMinor,
  i.allocated_minor AS allocatedMinor, i.state, i.notes, i.internal_note AS internalNote, i.source_module AS sourceModule,
  i.source_type AS sourceType, i.source_id AS sourceId, i.posting_id AS postingId, i.version, i.created_by AS createdBy,
  i.issued_by AS issuedBy, i.issued_at AS issuedAt, i.created_at AS createdAt`

const changed = { code: 'invoicing.invoice.changed', reason: 'Someone else changed this invoice a moment ago.', remedy: 'Reload it and try again.' }

export async function getInvoice(id: string | undefined): Promise<Invoice | null> {
  return id ? first<Invoice>(`SELECT ${COLUMNS} FROM invoicing_invoices i WHERE i.id = ?`, id) : null
}

export async function requireInvoice(id: string | undefined): Promise<Invoice> {
  const invoice = await getInvoice(id)
  if (!invoice || invoice.direction !== 'out') refuse('core.not-found', 'There is no such invoice.', { status: 404 })
  return invoice!
}

export async function linesOf(invoiceId: string): Promise<Line[]> {
  return all<Line>(
    `SELECT id, position, description, quantity_milli AS quantityMilli, unit_minor AS unitMinor, net_minor AS netMinor, tax_code AS taxCode,
      tax_minor AS taxMinor, tax_rate_bp AS taxRateBp, account_id AS accountId, owner_key AS ownerKey, production_id AS productionId
      FROM invoicing_lines WHERE invoice_id = ? ORDER BY position`, invoiceId)
}

/** What a draft may be written with: the income accounts and, while registered, the VAT codes. */
export async function draftChoices() {
  const registered = await useSetting('finance.tax.registered') === true
  return {
    accounts: (await accountsOf('invoicing', 'income')).map(a => ({ id: a.id, code: a.code, name: a.name })),
    registered,
    taxCodes: registered ? (await listTaxCodes({ activeOnly: true })).filter(c => c.code !== 'none').map(c => ({ code: c.code, label: c.label, rateBp: c.rateBasisPoints })) : [],
    defaultTaxCode: registered ? await useSetting('finance.tax.default-code') as string : 'none',
    taxNumberSet: typeof await useSetting('finance.tax.number') === 'string',
  }
}

interface Worked { lines: (Omit<Line, 'id' | 'ownerKey'>)[], netMinor: number, taxMinor: number }

/** Works out each line's net and VAT on the server, checking accounts and codes (I-05, I-06, I-07, I-42). */
async function work(input: DraftInput, partyTaxCode: string | null): Promise<Worked> {
  const choices = await draftChoices()
  const accounts = new Set(choices.accounts.map(a => a.id))
  const rates = new Map(choices.taxCodes.map(c => [c.code, c.rateBp]))
  const lines = input.lines.map((line, position) => {
    if (!accounts.has(line.accountId)) refuse('invoicing.line.account', 'Choose one of the income accounts invoices post to.', { status: 422, fields: { [`lines.${position}.accountId`]: 'invoicing.line.account' } })
    let taxCode = 'none'
    if (choices.registered) {
      taxCode = line.taxCode ?? partyTaxCode ?? choices.defaultTaxCode
      if (!rates.has(taxCode)) refuse('invoicing.tax-code-needed', 'Choose a VAT rate for every line.', { status: 422, fields: { [`lines.${position}.taxCode`]: 'invoicing.tax-code-needed' } })
    }
    const taxRateBp = rates.get(taxCode) ?? 0
    const netMinor = lineNet(line.quantityMilli, line.unitMinor)
    return { position, description: line.description, quantityMilli: line.quantityMilli, unitMinor: line.unitMinor, netMinor, taxCode, taxRateBp, taxMinor: lineTax(netMinor, taxRateBp), accountId: line.accountId, productionId: line.productionId ?? null }
  })
  return { lines, netMinor: lines.reduce((n, l) => n + l.netMinor, 0), taxMinor: lines.reduce((n, l) => n + l.taxMinor, 0) }
}

/** The party's columns: a person's account (their name, the party row's address) or a one-off name. */
async function partyOf(input: DraftInput): Promise<{ module: string | null, id: string | null, accountId: string | null, name: string, address: string, email: string | null, taxCode: string | null }> {
  if (input.party.kind === 'one-off') {
    if (!input.billToName) refuse('invoicing.invoice.party', 'Give the name the invoice is made out to.', { status: 422, fields: { billToName: 'invoicing.invoice.party' } })
    return { module: null, id: null, accountId: null, name: input.billToName!, address: input.billToAddress, email: input.billToEmail ?? null, taxCode: null }
  }
  const accountId = input.party.accountId
  const known = await first<{ id: string }>('SELECT id FROM core_accounts WHERE id = ? AND merged_into_id IS NULL AND anonymised_at IS NULL', accountId)
  if (!known) refuse('invoicing.invoice.party', 'Choose someone who has an account here.', { status: 422, fields: { party: 'invoicing.invoice.party' } })
  const party = await first<{ address: string, defaultTaxCode: string | null }>("SELECT address, default_tax_code AS defaultTaxCode FROM invoicing_parties WHERE party_module = 'core' AND party_id = ?", accountId)
  const email = input.billToEmail ?? (await first<{ address: string }>(`SELECT address FROM core_account_emails WHERE account_id IN (${accountScopeSql('?1')}) AND verified_at IS NOT NULL ORDER BY created_at`, accountId))?.address ?? null
  return { module: 'core', id: accountId, accountId, name: input.billToName || await accountLabel(accountId), address: input.billToAddress || party?.address || '', email, taxCode: party?.defaultTaxCode ?? null }
}

function writeLines(unit: UnitView, invoiceId: string, worked: Worked): void {
  unit.add({ sql: "DELETE FROM invoicing_lines WHERE invoice_id IN (SELECT id FROM invoicing_invoices WHERE id = ? AND state = 'draft')", params: [invoiceId] })
  if (!worked.lines.length) return
  unit.insertSet(lineTable, worked.lines.map(l => ({ invoiceId, ...l, ownerKey: null, performanceId: null, budgetLineId: null, budgetRequestId: null })))
}

/** A new draft invoice on the default series (IE-08). */
export async function createDraft(unit: UnitView, actor: Actor, raw: DraftInput): Promise<string> {
  const input = draftFields.parse(raw)
  const series = await defaultSeries('invoice')
  if (!series) refuse('invoicing.series.none', 'There is no invoice series to number it from.', { status: 409, remedy: 'Make one under Admin, Modules, Invoices.' })
  const party = await partyOf(input)
  const worked = await work(input, party.taxCode)
  const id = newId('ivc')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO invoicing_invoices (id, direction, kind, series_id, party_module, party_id, party_account_id, bill_to_name, bill_to_address, bill_to_email,
      tax_number, reference, supplied_on, currency, net_minor, tax_minor, total_minor, state, notes, internal_note, created_by, created_at, updated_at)
      VALUES (?, 'out', 'invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
    params: [id, series!.id, party.module, party.id, party.accountId, party.name, party.address, party.email, input.taxNumber, input.reference, input.suppliedOn ?? null,
      await useSetting('core.locale.currency'), worked.netMinor, worked.taxMinor, worked.netMinor + worked.taxMinor, input.notes, input.internalNote, actor.accountId ?? null, at, at],
  })
  writeLines(unit, id, worked)
  unit.audit({ action: 'create', record: ['invoicing.invoice', id], detail: { totalMinor: worked.netMinor + worked.taxMinor } })
  return id
}

/** Rewrites a draft whole: its party, its words and its lines (IE-08). */
export async function updateDraft(unit: UnitView, invoice: Invoice, raw: DraftInput & { version: number }): Promise<void> {
  if (invoice.state !== 'draft') refuse('invoicing.invoice.issued', 'An issued invoice cannot be changed; make a credit note instead.', { status: 409 })
  const { version, ...rest } = raw
  const input = draftFields.parse(rest)
  const party = await partyOf(input)
  const worked = await work(input, party.taxCode)
  unit.add({
    sql: `UPDATE invoicing_invoices SET party_module = ?, party_id = ?, party_account_id = ?, bill_to_name = ?, bill_to_address = ?, bill_to_email = ?, tax_number = ?,
      reference = ?, supplied_on = ?, net_minor = ?, tax_minor = ?, total_minor = ?, notes = ?, internal_note = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND state = 'draft' AND version = ?`,
    params: [party.module, party.id, party.accountId, party.name, party.address, party.email, input.taxNumber, input.reference, input.suppliedOn ?? null,
      worked.netMinor, worked.taxMinor, worked.netMinor + worked.taxMinor, input.notes, input.internalNote, nowMs(), invoice.id, version],
  }).expect(1, changed)
  writeLines(unit, invoice.id, worked)
  unit.audit({ action: 'update', record: ['invoicing.invoice', invoice.id], detail: { totalMinor: worked.netMinor + worked.taxMinor } })
}

export function deleteDraft(unit: UnitView, invoice: Invoice, version: number): void {
  if (invoice.state !== 'draft') refuse('invoicing.invoice.issued', 'An issued invoice cannot be deleted; make a credit note instead.', { status: 409 })
  unit.add({ sql: "DELETE FROM invoicing_lines WHERE invoice_id IN (SELECT id FROM invoicing_invoices WHERE id = ? AND state = 'draft' AND version = ?)", params: [invoice.id, version] })
  unit.add({ sql: "DELETE FROM invoicing_invoices WHERE id = ? AND state = 'draft' AND version = ?", params: [invoice.id, version] }).expect(1, changed)
  unit.audit({ action: 'delete', record: ['invoicing.invoice', invoice.id] })
}

/** When an invoice issued on `issueOn` falls due: the party's terms, or the theatre's (I-08). */
export async function dueFrom(invoice: Invoice, issueOn: string): Promise<string> {
  const party = invoice.partyModule ? await first<{ termsDays: number | null }>('SELECT terms_days AS termsDays FROM invoicing_parties WHERE party_module = ? AND party_id = ?', invoice.partyModule, invoice.partyId) : null
  const days = party?.termsDays ?? await useSetting('invoicing.terms.days') as number
  return previousDate(issueOn, -days)
}

/** The shown state (part 3): draft, issued, part paid, paid, credited, written off or settled; overdue beside. */
export function shownState(invoice: Pick<Invoice, 'state' | 'allocatedMinor' | 'totalMinor' | 'dueOn'>, on: string): { label: string, overdueDays: number } {
  const overdueDays = invoice.state === 'open' && invoice.dueOn && invoice.dueOn < on ? daysBetween(invoice.dueOn, on) : 0
  if (invoice.state === 'draft') return { label: 'draft', overdueDays: 0 }
  if (invoice.state === 'closed') return { label: 'paid', overdueDays: 0 }
  return { label: invoice.allocatedMinor > 0 ? 'part-paid' : 'issued', overdueDays }
}

const DAY_MS = 86_400_000 // not-policy: a calendar day of UTC dates

/** Whole calendar days from one theatre-local date to a later one. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export interface InvoiceRow extends Pick<Invoice, 'id' | 'number' | 'billToName' | 'issueOn' | 'dueOn' | 'totalMinor' | 'allocatedMinor' | 'state' | 'currency' | 'createdAt'> { shown: string, overdueDays: number }

/** S1: drafts first, then open ones by due date, then closed, newest first. */
export async function listInvoices(filter: { state?: InvoiceState } = {}): Promise<InvoiceRow[]> {
  const rows = await all<Invoice>(
    `SELECT ${COLUMNS} FROM invoicing_invoices i WHERE i.direction = 'out' AND i.kind = 'invoice' ${filter.state ? 'AND i.state = ?' : ''}
      ORDER BY CASE i.state WHEN 'draft' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, coalesce(i.due_on, ''), i.created_at DESC`, ...(filter.state ? [filter.state] : []))
  const on = await today()
  return rows.map((r) => {
    const shown = shownState(r, on)
    return { id: r.id, number: r.number, billToName: r.billToName, issueOn: r.issueOn, dueOn: r.dueOn, totalMinor: r.totalMinor, allocatedMinor: r.allocatedMinor, state: r.state, currency: r.currency, createdAt: r.createdAt, shown: shown.label, overdueDays: shown.overdueDays }
  })
}

/** What the viewer may do with one invoice, so the screen offers only that. */
export async function powersOn(actor: Actor, invoice: Invoice) {
  const on = { type: 'invoicing.invoice', id: invoice.id }
  return {
    canEdit: invoice.state === 'draft' && (await can(actor, 'invoicing.invoice.draft')).allowed,
    canIssue: invoice.state === 'draft' && (await can(actor, 'invoicing.invoice.issue', on)).allowed,
    canRecordPayment: invoice.state === 'open' && (await can(actor, 'invoicing.payment.record', on)).allowed,
  }
}
