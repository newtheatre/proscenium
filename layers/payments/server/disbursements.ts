// Money the theatre paid out (P-A1): a claim reimbursed, a bill paid. A person pays it in the bank,
// by cheque, on the theatre's card, from petty cash, or the parent body pays it; Payments records
// it, never sends it. The owner's handler returns its debit (the payable cleared) and Payments posts
// the credit on the method's account, as one transfer with the purpose disbursement.
import { all, first, localDate, newId, nowMs, Refusal, runInContext, useContext, usePoint, useSetting, type UnitView } from '#kit'
import { postEntries, reversePosting, type EntryInput } from '#modules/finance'
import type { DisbursementHandler, DisbursementMethod, DisbursementPart } from './points/disbursement'
import { touchPayee } from './payees'
import { ownerEntries } from './owner-entries'

export const DISBURSEMENT_METHODS: readonly DisbursementMethod[] = ['bank-transfer', 'cheque', 'theatre-card', 'petty-cash', 'parent-body']

/** The account each method pays from: the bank, a till's cash, or what the parent body holds for the theatre. */
const FROM: Record<DisbursementMethod, string> = {
  'bank-transfer': 'payments.bank',
  'cheque': 'payments.bank',
  'theatre-card': 'payments.bank',
  'petty-cash': 'payments.cash',
  'parent-body': 'payments.parent-body',
}

// A date entered by hand is placed at noon UTC, which falls on that same date in any theatre's zone.
const NOON_UTC = 'T12:00:00Z' // not-policy: see above
const REFERENCE_MAX = 40 // not-policy: the column's own check, as long as a bank's reference field

/** The disbursement handlers of the modules that are on, each run as its own module. */
export async function disbursementHandlers(): Promise<Map<string, DisbursementHandler>> {
  const out = new Map<string, DisbursementHandler>()
  for (const c of await usePoint<DisbursementHandler>('payments.disbursement')) {
    if (out.has(c.module)) throw new Error(`${c.module} contributes to payments.disbursement twice; a module has one handler for all its records`)
    const as = <T>(fn: () => T): T => runInContext({ ...useContext(), module: c.module }, fn)
    const { settle, reversed, payee } = c.value
    out.set(c.module, {
      settle: (unit, part) => as(() => settle(unit, part)),
      reversed: (unit, part) => as(() => reversed(unit, part)),
      payee: payee && (record => as(() => payee(record))),
    })
  }
  return out
}

export interface DisbursementInput {
  owner: { module: string, record: string }
  amountMinor: number
  method: DisbursementMethod
  /** The date it was paid, in the theatre's time zone. Not after today. */
  paidOn: string
  reference?: string | null
  payeeId?: string | null
}

/** Records money paid out and posts it; returns the disbursement's id. Never commits. */
export async function recordDisbursement(unit: UnitView, input: DisbursementInput): Promise<string> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Refusal('payments.disbursement.amount', 'The amount paid must be more than nothing.', { status: 422, fields: { amountMinor: 'payments.disbursement.amount' } })
  if (!DISBURSEMENT_METHODS.includes(input.method)) throw new Refusal('payments.disbursement.method', 'Choose how it was paid.', { status: 422, fields: { method: 'payments.disbursement.method' } })
  if (input.paidOn > await localDate(nowMs())) throw new Refusal('payments.disbursement.future', 'A payment is recorded once it has been made, so the date cannot be after today.', { status: 422, fields: { paidOn: 'payments.disbursement.future' } })
  const reference = input.reference?.trim() || null
  if (reference && reference.length > REFERENCE_MAX) throw new Refusal('payments.disbursement.reference', `A reference is at most ${REFERENCE_MAX} characters.`, { status: 422, fields: { reference: 'payments.disbursement.reference' } })
  const handler = (await disbursementHandlers()).get(input.owner.module)
  if (!handler) throw new Refusal('payments.disbursement.no-owner', `${input.owner.module} does not record payments made for its records.`, { status: 422 })
  if (input.payeeId && !await first('SELECT 1 FROM payments_payees WHERE id = ?', input.payeeId)) throw new Refusal('core.not-found', 'There are no such bank details.', { status: 404 })

  const id = newId('pdb')
  const currency = await useSetting('core.locale.currency') as string
  const part: DisbursementPart = { disbursementId: id, ownerRecord: input.owner.record, amountMinor: input.amountMinor, currency, method: input.method }
  const owned = await handler.settle(unit, part)
  const total = owned.reduce((sum, e) => sum + e.amountMinor, 0)
  if (total !== input.amountMinor) throw new Refusal('payments.disbursement.owner-entries', `${input.owner.module} returned entries for ${total}, not the ${input.amountMinor} paid.`, { status: 500 })

  const entries: EntryInput[] = [
    ...await ownerEntries(owned, input.owner.module, 'input'),
    { account: { key: FROM[input.method] }, amountMinor: -input.amountMinor },
  ]
  const postingId = await postEntries(unit, {
    key: `payments:disbursement:${id}`,
    source: { module: 'payments', type: 'payments.disbursement', id },
    kind: 'transfer',
    purpose: 'disbursement',
    occurredAt: Date.parse(`${input.paidOn}${NOON_UTC}`),
    currency,
    entries,
  })
  const { actor } = useContext()
  unit.add({
    sql: `INSERT INTO payments_disbursements (id, method, amount_minor, currency, owner_module, owner_record, payee_id, paid_on, reference, reverses_id, posting_id, by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    params: [id, input.method, input.amountMinor, currency, input.owner.module, input.owner.record, input.payeeId ?? null, input.paidOn, reference, postingId, actor.accountId ?? null, nowMs()],
  })
  if (input.payeeId) await touchPayee(unit, input.payeeId)
  unit.audit({ action: 'create', record: ['payments.disbursement', id], detail: { method: input.method, amountMinor: input.amountMinor, owner: input.owner.module } })
  return id
}

interface DisbursementRow { id: string, method: DisbursementMethod, amount_minor: number, currency: string, owner_module: string, owner_record: string, payee_id: string | null, paid_on: string, reference: string | null, reverses_id: string | null, posting_id: string }

/** Undoes a disbursement recorded by mistake: a reversing row, the posting reversed, the owner told. Once only. */
export async function reverseDisbursement(unit: UnitView, disbursementId: string): Promise<string> {
  const row = await first<DisbursementRow>('SELECT * FROM payments_disbursements WHERE id = ?', disbursementId)
  if (!row) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  if (row.reverses_id) throw new Refusal('payments.disbursement.is-reversal', 'This is itself a reversal.', { status: 409 })
  if (await first('SELECT 1 FROM payments_disbursements WHERE reverses_id = ?', row.id)) throw new Refusal('payments.disbursement.already-reversed', 'This payment has already been reversed.', { status: 409 })
  const handler = (await disbursementHandlers()).get(row.owner_module)
  if (!handler) throw new Refusal('payments.disbursement.no-owner', `${row.owner_module} is switched off, so its payment cannot be reversed now.`, { status: 409 })
  const id = newId('pdb')
  await handler.reversed(unit, { disbursementId: row.id, ownerRecord: row.owner_record, amountMinor: row.amount_minor, currency: row.currency, method: row.method })
  const postingId = await reversePosting(unit, row.posting_id)
  const { actor } = useContext()
  unit.add({
    sql: `INSERT INTO payments_disbursements (id, method, amount_minor, currency, owner_module, owner_record, payee_id, paid_on, reference, reverses_id, posting_id, by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, row.method, row.amount_minor, row.currency, row.owner_module, row.owner_record, row.payee_id, await localDate(nowMs()), row.reference, row.id, postingId, actor.accountId ?? null, nowMs()],
  })
  unit.audit({ action: 'state', record: ['payments.disbursement', row.id], detail: { reversed: id } })
  return id
}

export interface DisbursementSummary { id: string, method: DisbursementMethod, amountMinor: number, currency: string, paidOn: string, reference: string | null, payeeId: string | null, reversed: boolean }

/** The payments made for one owner record, oldest first, with whether each was reversed. Reversal rows are left out. */
export async function disbursementsOf(owner: { module: string, record: string }): Promise<DisbursementSummary[]> {
  const rows = await all<DisbursementRow & { reversed: number }>(
    `SELECT d.*, EXISTS (SELECT 1 FROM payments_disbursements r WHERE r.reverses_id = d.id) AS reversed FROM payments_disbursements d
    WHERE d.owner_module = ? AND d.owner_record = ? AND d.reverses_id IS NULL ORDER BY d.paid_on, d.created_at`, owner.module, owner.record)
  return rows.map(r => ({ id: r.id, method: r.method, amountMinor: r.amount_minor, currency: r.currency, paidOn: r.paid_on, reference: r.reference, payeeId: r.payee_id, reversed: r.reversed === 1 }))
}
