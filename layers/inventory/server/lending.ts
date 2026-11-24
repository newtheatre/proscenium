// Lending straight from a department (INV-21, L3, L4, L7): one unit makes the loan, its lines and
// their promises, so a loan agreed on the phone is one step and never half-promised.
import { sql } from 'drizzle-orm'
import { first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { dayBounds } from '#modules/core'
import type { LendInput } from '../shared/loans'
import { getLoan, insertLoan, moveLoan, promiseLine, windowFor, type Loan } from './loans'
import { whyNotFree } from './promise'

// The loan may run no longer than inventory.loans.max-length.
export async function checkLength(startsOn: string, dueBackOn: string): Promise<void> {
  const max = Math.round((await useSetting('inventory.loans.max-length') as number) / 86_400) // not-policy: seconds in a day
  const row = await first<{ days: number }>('SELECT julianday(?) - julianday(?) AS days', dueBackOn, startsOn)
  if ((row?.days ?? 0) > max) refuse('inventory.loan.too-long', `A loan may run for at most ${max} days.`, { status: 422, detail: { max: String(max) } })
}

// L7: name every item that cannot be promised before writing, so the screen can say which.
async function refuseUnfree(departmentId: string, itemIds: string[], loan: { from: number, to: number, startDay: string }): Promise<void> {
  const failing: Record<string, string> = {}
  for (const itemId of itemIds) {
    const why = await whyNotFree({ itemId, quantity: 1, departmentId, window: loan, except: { loanId: '' } })
    if (why) failing[itemId] = why.reason === 'taken' ? `taken:${why.loanIds.join(',')}` : why.reason
  }
  if (Object.keys(failing).length) refuse('inventory.loan.clash', 'Some items cannot be promised for these dates.', { status: 409, detail: failing })
}

export async function lend(unit: UnitView, input: LendInput, actorId: string | null): Promise<string> {
  await checkLength(input.startsOn, input.dueBackOn)
  const itemIds = [...new Set(input.itemIds)]
  const startsAt = (await dayBounds(input.startsOn)).start
  const w = await windowFor(startsAt, input.dueBackOn)
  await refuseUnfree(input.departmentId, itemIds, w)
  const id = await insertLoan(unit, {
    departmentId: input.departmentId, kind: input.kind, state: 'requested', responsibleAccountId: input.kind === 'member' ? input.borrowerAccountId : null,
    borrowerName: input.kind === 'outside' ? input.borrowerName : null, borrowerEmail: input.kind === 'outside' ? input.borrowerEmail : null,
    purpose: input.purpose, startsAt, dueBackOn: input.dueBackOn, requestedBy: actorId,
  }, { quiet: true })
  const loan: Loan = { id, departmentId: input.departmentId, kind: input.kind, state: 'requested', startsAt, dueBackOn: input.dueBackOn, dueBackAt: w.to, responsibleAccountId: null, productionId: null }
  // L4: a holder of loan.approve lending makes the loan Approved in the same unit.
  moveLoan(unit, loan, { to: 'approved', actor: actorId, set: sql`decided_by = ${actorId}, decided_at = ${nowMs()}` })
  for (const [sort, itemId] of itemIds.entries()) {
    const lineId = newId('kll')
    unit.add(sql`INSERT INTO inventory_loan_lines (id, loan_id, item_id, quantity, state, sort, created_at, updated_at)
      SELECT ${lineId}, ${id}, i.id, 1, 'listed', ${sort}, ${nowMs()}, ${nowMs()} FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id
      WHERE i.id = ${itemId} AND c.department_id = ${input.departmentId} AND i.lendable = 1`)
      .expect(1, { code: 'inventory.line.wrong-item', reason: 'That item cannot go on this loan.', remedy: 'Choose an item this department lends.' })
    await promiseLine(unit, loan, { id: lineId, loanId: id, itemId, quantity: 1, state: 'listed' }, w)
  }
  unit.audit({ action: 'create', record: ['inventory.loan', id], detail: { kind: input.kind, lines: String(itemIds.length) } })
  return id
}

export async function loanOf(id: string): Promise<Loan> {
  return (await getLoan(id)) ?? refuse('inventory.loan.not-found', 'There is no such loan.', { status: 404 })
}

// A line, and the contents promised with it, come off a loan not yet out (L16).
export function removeLine(unit: UnitView, loanId: string, lineId: string): void {
  const at = nowMs()
  unit.add(sql`UPDATE inventory_loan_lines SET state = 'cancelled', updated_at = ${at}
    WHERE id = ${lineId} AND loan_id = ${loanId} AND with_line_id IS NULL AND state IN ('wanted', 'listed', 'promised')
      AND EXISTS (SELECT 1 FROM inventory_loans o WHERE o.id = ${loanId} AND o.state IN ('draft', 'requested', 'approved'))`)
    .expect(1, { code: 'inventory.line.fixed', reason: 'This line can no longer be taken off: the loan is out or finished.', remedy: 'Return the item instead.' })
  unit.add(sql`UPDATE inventory_loan_lines SET state = 'cancelled', updated_at = ${at} WHERE with_line_id = ${lineId} AND loan_id = ${loanId} AND state = 'promised'`)
  unit.audit({ action: 'update', record: ['inventory.loan', loanId], detail: { removedLine: lineId } })
}
