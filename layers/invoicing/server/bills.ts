// Bills in (IE-19, IE-20; rules I-07, I-10, I-11, I-43, I-44): a supplier's invoice logged with its
// file, submitted, then approved by someone other than whoever logged it, which posts it once: Dr each
// line's expense account its net with its VAT code, Dr Finance's input VAT the VAT, Cr Creditors the
// gross. An approver may send it back with a note instead.
import { all, can, first, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { attachFile } from '#modules/core'
import { ledgerAccounts, listTaxCodes, postEntries, type EntryInput } from '#modules/finance'
import { billFields, lineNet, lineTax, type BillInput } from '../shared/invoices'
import { COLUMNS, dueFrom, linesOf, partyOf, writeLines, type Invoice, type Worked } from './invoices'
import { formatMoney } from './money'

export const BILL_FILE_SLOT = 'invoicing.bill-file'
const changed = { code: 'invoicing.bill.changed', reason: 'Someone else changed this bill a moment ago.', remedy: 'Reload it and try again.' }

export async function getBill(id: string | undefined): Promise<Invoice | null> {
  if (!id) return null
  return first<Invoice>(`SELECT ${COLUMNS} FROM invoicing_invoices i WHERE i.id = ? AND i.direction = 'in'`, id)
}

export async function requireBill(id: string | undefined): Promise<Invoice> {
  const bill = await getBill(id)
  if (!bill) refuse('core.not-found', 'There is no such bill.', { status: 404 })
  return bill!
}

/** What a bill may be coded with: any module's active expense accounts and, while VAT-registered, the codes with their rates. */
export async function billChoices() {
  const registered = await useSetting('finance.tax.registered') === true
  return {
    accounts: (await ledgerAccounts()).filter(a => a.active && a.kind === 'expense').map(a => ({ id: a.id, code: a.code, name: a.name })),
    registered,
    taxCodes: registered ? (await listTaxCodes({ activeOnly: true })).filter(c => c.code !== 'none').map(c => ({ code: c.code, label: c.label, rateBp: c.rateBasisPoints })) : [],
    defaultTaxCode: registered ? await useSetting('finance.tax.default-code') as string : 'none',
  }
}

/** Each line's net, and its VAT as typed (I-43): the code's worked figure when none was typed. */
async function workBill(input: BillInput, partyTaxCode: string | null): Promise<Worked> {
  const choices = await billChoices()
  const accounts = new Set(choices.accounts.map(a => a.id))
  const rates = new Map(choices.taxCodes.map(c => [c.code, c.rateBp]))
  const lines = input.lines.map((line, position) => {
    if (!accounts.has(line.accountId)) refuse('invoicing.line.account', 'Choose one of the expense accounts bills post to.', { status: 422, fields: { [`lines.${position}.accountId`]: 'invoicing.line.account' } })
    let taxCode = 'none'
    if (choices.registered) {
      taxCode = line.taxCode ?? partyTaxCode ?? choices.defaultTaxCode
      if (!rates.has(taxCode)) refuse('invoicing.tax-code-needed', 'Choose a VAT rate for every line.', { status: 422, fields: { [`lines.${position}.taxCode`]: 'invoicing.tax-code-needed' } })
    }
    const taxRateBp = rates.get(taxCode) ?? 0
    const netMinor = lineNet(line.quantityMilli, line.unitMinor)
    const taxMinor = choices.registered ? (line.taxMinor ?? lineTax(netMinor, taxRateBp)) : 0
    if (taxCode === 'none' && taxMinor) refuse('invoicing.bill.vat-without-code', 'A line with VAT needs a VAT rate.', { status: 422, fields: { [`lines.${position}.taxMinor`]: 'invoicing.bill.vat-without-code' } })
    return { position, description: line.description, quantityMilli: line.quantityMilli, unitMinor: line.unitMinor, netMinor, taxCode, taxRateBp, taxMinor, accountId: line.accountId, productionId: line.productionId ?? null }
  })
  return { lines, netMinor: lines.reduce((n, l) => n + l.netMinor, 0), taxMinor: lines.reduce((n, l) => n + l.taxMinor, 0) }
}

const partyInput = (input: BillInput) => ({ party: input.party, billToName: input.billToName, billToAddress: '', billToEmail: null })

/** Logs a bill as a draft (IE-19). */
export async function createBill(unit: UnitView, actor: Actor, raw: BillInput): Promise<string> {
  const input = billFields.parse(raw)
  const party = await partyOf(partyInput(input))
  const worked = await workBill(input, party.taxCode)
  await refuseDuplicate(party, input.supplierNumber || null, null)
  const id = newId('ivc')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO invoicing_invoices (id, direction, kind, party_module, party_id, party_account_id, bill_to_name, tax_number, number, issue_on, due_on, currency,
      net_minor, tax_minor, total_minor, state, internal_note, reminders_on, created_by, created_at, updated_at)
      VALUES (?, 'in', 'invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0, ?, ?, ?)`,
    params: [id, party.module, party.id, party.accountId, party.name, input.taxNumber, input.supplierNumber || null, input.issueOn ?? null, input.dueOn ?? null,
      await useSetting('core.locale.currency'), worked.netMinor, worked.taxMinor, worked.netMinor + worked.taxMinor, input.internalNote, actor.accountId ?? null, at, at],
  })
  writeLines(unit, id, worked)
  unit.audit({ action: 'create', record: ['invoicing.invoice', id], detail: { direction: 'in', totalMinor: worked.netMinor + worked.taxMinor } })
  return id
}

/** Rewrites a draft bill whole. */
export async function updateBill(unit: UnitView, bill: Invoice, raw: BillInput & { version: number }): Promise<void> {
  if (bill.state !== 'draft') refuse('invoicing.bill.submitted', 'A submitted bill cannot be changed; ask the approver to send it back.', { status: 409 })
  const { version, ...rest } = raw
  const input = billFields.parse(rest)
  const party = await partyOf(partyInput(input))
  const worked = await workBill(input, party.taxCode)
  await refuseDuplicate(party, input.supplierNumber || null, bill.id)
  unit.add({
    sql: `UPDATE invoicing_invoices SET party_module = ?, party_id = ?, party_account_id = ?, bill_to_name = ?, tax_number = ?, number = ?, issue_on = ?, due_on = ?,
      net_minor = ?, tax_minor = ?, total_minor = ?, internal_note = ?, version = version + 1, updated_at = ? WHERE id = ? AND direction = 'in' AND state = 'draft' AND version = ?`,
    params: [party.module, party.id, party.accountId, party.name, input.taxNumber, input.supplierNumber || null, input.issueOn ?? null, input.dueOn ?? null,
      worked.netMinor, worked.taxMinor, worked.netMinor + worked.taxMinor, input.internalNote, nowMs(), bill.id, version],
  }).expect(1, changed)
  writeLines(unit, bill.id, worked)
  unit.audit({ action: 'update', record: ['invoicing.invoice', bill.id], detail: { totalMinor: worked.netMinor + worked.taxMinor } })
}

export function deleteBill(unit: UnitView, bill: Invoice, version: number): void {
  if (bill.state !== 'draft') refuse('invoicing.bill.submitted', 'Only a draft bill can be deleted.', { status: 409 })
  unit.add({ sql: "DELETE FROM invoicing_lines WHERE invoice_id IN (SELECT id FROM invoicing_invoices WHERE id = ? AND state = 'draft' AND version = ?)", params: [bill.id, version] })
  unit.add({ sql: "DELETE FROM invoicing_invoices WHERE id = ? AND direction = 'in' AND state = 'draft' AND version = ?", params: [bill.id, version] }).expect(1, changed)
  unit.audit({ action: 'delete', record: ['invoicing.invoice', bill.id] })
}

/** Keeps an uploaded, checked file as the bill's copy of the supplier's invoice (I-11). */
export async function attachBillFile(unit: UnitView, bill: Invoice, fileId: string): Promise<void> {
  if (bill.state !== 'draft') refuse('invoicing.bill.submitted', 'A submitted bill cannot be changed; ask the approver to send it back.', { status: 409 })
  await attachFile(unit, fileId, { slot: BILL_FILE_SLOT, ownerType: 'invoicing.invoice', ownerId: bill.id })
  unit.add({ sql: "UPDATE invoicing_invoices SET pdf_file_id = ?, updated_at = ? WHERE id = ? AND state = 'draft'", params: [fileId, nowMs(), bill.id] }).expect(1, changed)
}

/** Refuses a supplier number already logged for that supplier, naming the earlier bill (I-11); a one-off supplier matches by name. */
async function refuseDuplicate(party: { module: string | null, id: string | null, name: string }, number: string | null, selfId: string | null): Promise<void> {
  if (!number) return
  const who = party.module
    ? { sql: 'party_module = ? AND party_id = ?', params: [party.module, party.id] }
    : { sql: 'party_module IS NULL AND lower(bill_to_name) = lower(?)', params: [party.name] }
  const earlier = await first<{ id: string, issueOn: string | null }>(
    `SELECT id, issue_on AS issueOn FROM invoicing_invoices WHERE direction = 'in' AND kind = 'invoice' AND id <> ? AND number = ? AND ${who.sql}`, selfId ?? '', number, ...who.params)
  if (earlier) refuse('invoicing.bill.duplicate', `This supplier's invoice ${number} is already logged.`, { status: 409, fields: { supplierNumber: 'invoicing.bill.duplicate' }, remedy: `See bill ${earlier.id}.` })
}

/** Sends a draft bill to the approvers: it needs the supplier's file, number, dates and lines (I-11). */
export async function submitBill(unit: UnitView, bill: Invoice, version: number): Promise<void> {
  if (bill.state !== 'draft') refuse('invoicing.bill.submitted', 'This bill has already been submitted.', { status: 409 })
  const file = await first<{ id: string }>("SELECT f.id FROM invoicing_invoices i JOIN core_files f ON f.id = i.pdf_file_id WHERE i.id = ? AND f.state = 'ready'", bill.id)
  if (!file) refuse('invoicing.bill.no-file', 'Attach the supplier\'s invoice before submitting the bill.', { status: 422, fields: { file: 'invoicing.bill.no-file' } })
  const missing = { ...(!bill.number ? { supplierNumber: 'core.form.invalid.required' } : {}), ...(!bill.issueOn ? { issueOn: 'core.form.invalid.required' } : {}) }
  if (Object.keys(missing).length) refuse('invoicing.bill.incomplete', 'A bill needs the supplier\'s invoice number and date.', { status: 422, fields: missing })
  if (!(await linesOf(bill.id)).length || bill.totalMinor <= 0) refuse('invoicing.bill.no-lines', 'A bill needs at least one line with an amount.', { status: 422 })
  await refuseDuplicate({ module: bill.partyModule, id: bill.partyId, name: bill.billToName }, bill.number, bill.id)
  const dueOn = bill.dueOn ?? await dueFrom(bill, bill.issueOn!)
  unit.add({
    sql: "UPDATE invoicing_invoices SET state = 'submitted', due_on = ?, returned_note = '', version = version + 1, updated_at = ? WHERE id = ? AND direction = 'in' AND state = 'draft' AND version = ?",
    params: [dueOn < bill.issueOn! ? bill.issueOn : dueOn, nowMs(), bill.id, version],
  }).expect(1, changed)
  unit.audit({ action: 'state', record: ['invoicing.invoice', bill.id], detail: { from: 'draft', to: 'submitted' } })
}

/** Refuses whoever logged the bill, under any of their merged accounts (I-10: four eyes, Owners included). */
async function requireSecondPerson(actor: Actor, bill: Invoice): Promise<void> {
  if (!actor.accountId || !bill.createdBy) return
  const same = await first(`SELECT 1 AS same WHERE ? IN (${accountScopeSql('?2')})`, bill.createdBy, actor.accountId)
  if (same) refuse('invoicing.bill.own', 'You logged this bill, so someone else approves it.', { status: 403 })
}

/** Approves a submitted bill and posts it, once (IE-20, I-44). */
export async function approveBill(unit: UnitView, actor: Actor, bill: Invoice, input: { version: number, expectedTotalMinor: number }): Promise<void> {
  if (bill.state !== 'submitted') refuse('invoicing.bill.not-submitted', 'Only a submitted bill can be approved.', { status: 409 })
  await requireSecondPerson(actor, bill)
  if (input.expectedTotalMinor !== bill.totalMinor)
    refuse('invoicing.bill.total-differs', `The total shown was ${await formatMoney(input.expectedTotalMinor, bill.currency)} but the bill comes to ${await formatMoney(bill.totalMinor, bill.currency)}.`, { status: 409, remedy: 'Reload it and check the total.' })
  const lines = await linesOf(bill.id)
  const entries: EntryInput[] = []
  for (const line of lines) {
    if (line.netMinor || line.taxMinor) entries.push({ account: line.accountId!, amountMinor: line.netMinor, taxCode: line.taxCode, taxMinor: line.taxMinor, productionId: line.productionId })
  }
  if (bill.taxMinor) entries.push({ account: { key: 'finance.vat-input' }, amountMinor: bill.taxMinor, forModule: 'finance' })
  entries.push({ account: { key: 'invoicing.payable' }, amountMinor: -bill.totalMinor })
  const at = nowMs()
  const postingId = await postEntries(unit, {
    key: `invoicing:bill:${bill.id}:approve`,
    source: { module: 'invoicing', type: 'invoicing.invoice', id: bill.id },
    kind: 'transfer',
    purpose: 'bill',
    currency: bill.currency,
    postedBy: actor.accountId ?? undefined,
    occurredAt: at,
    entries,
  })
  unit.add({
    sql: "UPDATE invoicing_invoices SET state = 'open', posting_id = ?, issued_by = ?, issued_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND direction = 'in' AND state = 'submitted' AND version = ? AND total_minor = ?",
    params: [postingId, actor.accountId ?? null, at, at, bill.id, input.version, input.expectedTotalMinor],
  }).expect(1, changed)
  unit.audit({ action: 'state', record: ['invoicing.invoice', bill.id], detail: { from: 'submitted', to: 'open', totalMinor: bill.totalMinor } })
  unit.announce('invoicing.bill.approved', { invoiceId: bill.id, totalMinor: bill.totalMinor }, { record: ['invoicing.invoice', bill.id] })
}

/** Sends a submitted bill back to whoever logged it, with a note they read. */
export async function returnBill(unit: UnitView, actor: Actor, bill: Invoice, input: { version: number, note: string }): Promise<void> {
  if (bill.state !== 'submitted') refuse('invoicing.bill.not-submitted', 'Only a submitted bill can be sent back.', { status: 409 })
  await requireSecondPerson(actor, bill)
  unit.add({
    sql: "UPDATE invoicing_invoices SET state = 'draft', returned_note = ?, version = version + 1, updated_at = ? WHERE id = ? AND direction = 'in' AND state = 'submitted' AND version = ?",
    params: [input.note, nowMs(), bill.id, input.version],
  }).expect(1, changed)
  unit.audit({ action: 'state', record: ['invoicing.invoice', bill.id], detail: { from: 'submitted', to: 'draft' } })
}

export interface BillRow { id: string, number: string | null, supplier: string, issueOn: string | null, dueOn: string | null, totalMinor: number, allocatedMinor: number, state: string, currency: string, createdBy: string | null, mine: boolean, mayApprove: boolean }

/** S3: drafts, then those waiting for approval, then approved by due date, then paid. */
export async function listBills(actor: Actor): Promise<BillRow[]> {
  const rows = await all<{ id: string, number: string | null, supplier: string, issueOn: string | null, dueOn: string | null, totalMinor: number, allocatedMinor: number, state: string, currency: string, createdBy: string | null, mine: number }>(
    `SELECT i.id, i.number, i.bill_to_name AS supplier, i.issue_on AS issueOn, i.due_on AS dueOn, i.total_minor AS totalMinor, i.allocated_minor AS allocatedMinor, i.state,
      i.currency, i.created_by AS createdBy, CASE WHEN i.created_by IN (${accountScopeSql('?1')}) THEN 1 ELSE 0 END AS mine
      FROM invoicing_invoices i WHERE i.direction = 'in' AND i.kind = 'invoice'
      ORDER BY CASE i.state WHEN 'draft' THEN 0 WHEN 'submitted' THEN 1 WHEN 'open' THEN 2 ELSE 3 END, coalesce(i.due_on, ''), i.created_at DESC`, actor.accountId ?? '') // not-policy: the states' order
  const approver = (await can(actor, 'invoicing.bill.approve')).allowed
  return rows.map(r => ({ ...r, mine: !!r.mine, mayApprove: approver && r.state === 'submitted' && !r.mine }))
}

export async function billPowers(actor: Actor, bill: Invoice) {
  const on = { type: 'invoicing.invoice', id: bill.id }
  const mine = !!bill.createdBy && !!actor.accountId && !!(await first(`SELECT 1 AS same WHERE ? IN (${accountScopeSql('?2')})`, bill.createdBy, actor.accountId))
  return {
    mine,
    canEdit: bill.state === 'draft' && (await can(actor, 'invoicing.bill.log')).allowed,
    canApprove: bill.state === 'submitted' && !mine && (await can(actor, 'invoicing.bill.approve', on)).allowed,
  }
}
