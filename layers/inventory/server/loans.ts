// Loans and their lines (part 3, "Loans and their lines"). Every move is one guarded statement that
// names the states it may come from, with its event in the same unit, so two people acting at once
// can never both succeed (I7). Approval promises every listed line or none (L7).
import { sql, type SQL } from 'drizzle-orm'
import { newId, nowMs, refuse, useDb, type UnitView } from '#kit'
import { dayBounds, operatingDayOf } from '#modules/core'
import { canMove, LINE_MOVES, LOAN_MOVES, movesInto, type CancelReason, type LineState, type LoanKind, type LoanState } from '../shared/states'
import { CLASH, freeSql, whyNotFree, type Taken, type Window } from './promise'

export interface Loan {
  id: string
  departmentId: string
  kind: LoanKind
  state: LoanState
  startsAt: number
  dueBackOn: string
  dueBackAt: number
  responsibleAccountId: string | null
}

export interface Line { id: string, loanId: string, itemId: string | null, quantity: number, state: LineState }

const MOVED = { code: 'inventory.loan.moved', reason: 'Someone else has just changed this loan.', remedy: 'Look at the loan again.' }

/** The loan's window: from its start to the close of the due-back date's operating day (L8). */
export async function windowFor(startsAt: number, dueBackOn: string): Promise<Window> {
  return { from: startsAt, to: (await dayBounds(dueBackOn)).end, startDay: await operatingDayOf(startsAt) }
}

export async function getLoan(id: string): Promise<Loan | null> {
  const [row] = await useDb().all<Loan>(sql`SELECT id, department_id AS departmentId, kind, state, starts_at AS startsAt, due_back_on AS dueBackOn,
    due_back_at AS dueBackAt, responsible_account_id AS responsibleAccountId FROM inventory_loans WHERE id = ${id}`)
  return row ?? null
}

export async function linesOf(loanId: string): Promise<Line[]> {
  return useDb().all<Line>(sql`SELECT id, loan_id AS loanId, item_id AS itemId, quantity, state FROM inventory_loan_lines WHERE loan_id = ${loanId} ORDER BY sort, id`)
}

export interface NewLoan {
  departmentId: string
  kind: LoanKind
  state: 'draft' | 'requested'
  productionId?: string | null
  responsibleAccountId: string | null
  borrowerName?: string | null
  borrowerEmail?: string | null
  purpose?: string | null
  startsAt: number
  dueBackOn: string
  requestedBy: string | null
}

/** L3: who the department lends to, as a condition on the department row `d`. */
const lendsSql = (kind: LoanKind): SQL => kind === 'production'
  ? sql`1`
  : kind === 'member' ? sql`d.lends_to IN ('members', 'anyone')` : sql`d.lends_to = 'anyone'`

/** Makes a draft pull list or a request. The department must be active and lend to this kind of borrower (L3). */
export async function insertLoan(unit: UnitView, input: NewLoan): Promise<string> {
  const id = newId('kln')
  const at = nowMs()
  const w = await windowFor(input.startsAt, input.dueBackOn)
  unit.add(sql`INSERT INTO inventory_loans (id, department_id, kind, state, production_id, responsible_account_id, borrower_name, borrower_email, purpose,
      starts_at, due_back_on, due_back_at, due_back_set, requested_by, created_at, updated_at)
    SELECT ${id}, d.id, ${input.kind}, ${input.state}, ${input.productionId ?? null}, ${input.responsibleAccountId}, ${input.borrowerName ?? null}, ${input.borrowerEmail ?? null}, ${input.purpose ?? null},
      ${input.startsAt}, ${input.dueBackOn}, ${w.to}, 'by-person', ${input.requestedBy}, ${at}, ${at}
    FROM inventory_departments d WHERE d.id = ${input.departmentId} AND d.state = 'active' AND ${lendsSql(input.kind)}`)
    .expect(1, { code: 'inventory.loan.not-lent', reason: 'This department does not lend to this borrower.', remedy: 'Ask the department.' })
  if (input.state === 'requested') unit.announce('inventory.loan.requested', { loanId: id, departmentId: input.departmentId }, { record: ['inventory.loan', id] })
  return id
}

/**
 * Adds a line while the loan is a draft or a request: in words (wanted), or naming an item of the
 * loan's own department that may be lent (L2, L3). Promising comes with approval.
 */
export function addLine(unit: UnitView, loan: Loan, line: { itemId?: string | null, wanted?: string | null, quantity?: number }): string {
  const id = newId('kll')
  const at = nowMs()
  const quantity = line.quantity ?? 1
  if (!line.itemId) {
    unit.add(sql`INSERT INTO inventory_loan_lines (id, loan_id, wanted, quantity, state, created_at, updated_at)
      SELECT ${id}, o.id, ${line.wanted ?? null}, ${quantity}, 'wanted', ${at}, ${at} FROM inventory_loans o WHERE o.id = ${loan.id} AND o.state IN ('draft', 'requested')`).expect(1, MOVED)
    return id
  }
  unit.add(sql`INSERT INTO inventory_loan_lines (id, loan_id, item_id, wanted, quantity, state, created_at, updated_at)
    SELECT ${id}, o.id, i.id, ${line.wanted ?? null}, ${quantity}, 'listed', ${at}, ${at}
    FROM inventory_loans o JOIN inventory_items i ON i.id = ${line.itemId} JOIN inventory_categories c ON c.id = i.category_id
    WHERE o.id = ${loan.id} AND o.state IN ('draft', 'requested') AND c.department_id = o.department_id AND i.lendable = 1
      AND (i.tracking = 'counted' OR ${quantity} = 1)`)
    .expect(1, { code: 'inventory.line.wrong-item', reason: 'That item cannot go on this loan.', remedy: 'Choose an item this department lends.' })
  return id
}

/** An individual item's contents (I6): what a container takes with it. */
async function contentsOf(itemId: string): Promise<string[]> {
  const rows = await useDb().all<{ id: string }>(sql`SELECT id FROM inventory_items WHERE container_id = ${itemId} AND state <> 'disposed' ORDER BY id`)
  return rows.map(r => r.id)
}

/**
 * Promises one line under C1 to C4, and a container's contents on lines of their own in the same
 * unit (C6): the container's statement also expects its contents to be what was read, and every
 * content line expects its row, so a container goes whole or not at all.
 */
export async function promiseLine(unit: UnitView, loan: Loan, line: Line, w: Window): Promise<void> {
  if (!line.itemId) refuse('inventory.line.wanted', 'A wanted line names no item yet.', { status: 422 })
  if (!canMove(LINE_MOVES, line.state, 'promised')) refuse('inventory.line.wrong-state', `A ${line.state} line cannot be promised.`, { status: 409 })
  const at = nowMs()
  const contents = await contentsOf(line.itemId)
  const whole = contents.length ? sql` AND (SELECT count(*) FROM inventory_items WHERE container_id = ${line.itemId} AND state <> 'disposed') = ${contents.length}` : sql``
  unit.add(sql`UPDATE inventory_loan_lines SET state = 'promised', updated_at = ${at}
    WHERE id = ${line.id} AND state IN ('wanted', 'listed') AND item_id = ${line.itemId}
      AND ${freeSql(line.itemId, line.quantity, loan.departmentId, w, { lineId: line.id }, at)}${whole}`).expect(1, CLASH)
  for (const content of contents) {
    const id = newId('kll')
    unit.add(sql`INSERT INTO inventory_loan_lines (id, loan_id, item_id, quantity, state, with_line_id, created_at, updated_at)
      SELECT ${id}, ${loan.id}, ${content}, 1, 'promised', ${line.id}, ${at}, ${at}
      WHERE (SELECT container_id FROM inventory_items WHERE id = ${content}) = ${line.itemId}
        AND ${freeSql(content, 1, loan.departmentId, w, { lineId: id }, at)}`).expect(1, CLASH)
  }
}

export interface Failing { lineId: string, itemId: string, why: Taken }

/** What would stop each listed line being promised now: what the screen names when approval is refused (L7). */
export async function failingLines(loan: Loan, w: Window, lines: Line[]): Promise<Failing[]> {
  const out: Failing[] = []
  for (const line of lines) {
    if (!line.itemId || line.state !== 'listed') continue
    const why = await whyNotFree(line.itemId, line.quantity, loan.departmentId, w, { lineId: line.id })
    if (why) out.push({ lineId: line.id, itemId: line.itemId, why })
  }
  return out
}

/** Each failing line and why, for the screen: `not-usable`, or `taken` with the loans in the way. */
export const describe = (failing: Failing[]): Record<string, string> =>
  Object.fromEntries(failing.map(f => [f.lineId, f.why.reason === 'taken' ? `taken:${f.why.loanIds.join(',')}` : f.why.reason]))

export interface Move {
  to: LoanState
  actor: string | null
  set?: SQL
  where?: SQL
  reason?: CancelReason
}

const EVENT_OF: Partial<Record<LoanState, string>> = {
  requested: 'inventory.loan.requested',
  approved: 'inventory.loan.approved',
  declined: 'inventory.loan.declined',
  cancelled: 'inventory.loan.cancelled',
}

/** One guarded update that names the states the loan may come from, with its event (I7). */
export function moveLoan(unit: UnitView, loan: Loan, move: Move, refusal = MOVED): void {
  if (!canMove(LOAN_MOVES, loan.state, move.to)) refuse('inventory.loan.wrong-state', `A ${loan.state} loan cannot become ${move.to}.`, { status: 409 })
  const from = movesInto(LOAN_MOVES, move.to)
  unit.add(sql`UPDATE inventory_loans SET state = ${move.to}, cancel_reason = ${move.reason ?? null}, updated_at = ${nowMs()}${move.set ? sql`, ${move.set}` : sql``}
    WHERE id = ${loan.id} AND state IN (${sql.join(from.map(s => sql`${s}`), sql`, `)})${move.where ? sql` AND ${move.where}` : sql``}`).expect(1, refusal)
  const name = EVENT_OF[move.to]
  if (name) unit.announce(name, { loanId: loan.id, departmentId: loan.departmentId }, { record: ['inventory.loan', loan.id] })
}

/**
 * L7: approval promises every listed line or none. A read first names each line that cannot be
 * promised; the statements then carry the check again, so a line taken in between still refuses
 * the whole approval. Wanted lines stay wanted (L6).
 */
export async function approveLoan(unit: UnitView, loanId: string, approver: string): Promise<void> {
  const loan = await getLoan(loanId)
  if (!loan) refuse('inventory.loan.not-found', 'There is no such loan.', { status: 404 })
  const w = await windowFor(loan.startsAt, loan.dueBackOn)
  const lines = await linesOf(loan.id)
  const failing = await failingLines(loan, w, lines)
  if (failing.length) refuse(CLASH.code, 'Some items cannot be promised for these dates.', { status: 409, detail: describe(failing) })
  moveLoan(unit, loan, { to: 'approved', actor: approver, set: sql`decided_by = ${approver}, decided_at = ${nowMs()}` })
  for (const line of lines) if (line.state === 'listed') await promiseLine(unit, loan, line, w)
}

/** Releases every line that does not yet hold an item out (L16, L17). */
function releaseLines(unit: UnitView, loanId: string): void {
  unit.add(sql`UPDATE inventory_loan_lines SET state = 'cancelled', updated_at = ${nowMs()} WHERE loan_id = ${loanId} AND state IN ('wanted', 'listed', 'promised')`)
}

/** L17: declining releases everything; the note goes to the borrower. */
export async function declineLoan(unit: UnitView, loan: Loan, decider: string, note: string | null): Promise<void> {
  moveLoan(unit, loan, { to: 'declined', actor: decider, set: sql`decided_by = ${decider}, decided_at = ${nowMs()}, decline_note = ${note}` })
  releaseLines(unit, loan.id)
}

/** L16: a draft, requested or approved loan may be cancelled; an out loan may not. */
export async function cancelLoan(unit: UnitView, loan: Loan, actor: string | null, reason: CancelReason): Promise<void> {
  moveLoan(unit, loan, { to: 'cancelled', actor, reason })
  releaseLines(unit, loan.id)
}
