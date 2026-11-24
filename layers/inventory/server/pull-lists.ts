// A production's pull lists (INV-17, INV-18; L2, L5, L6, L9): started from the production's Kit tab,
// gathered in words and matched to items, submitted to the department, which approves all or none.
import { sql } from 'drizzle-orm'
import { all, first, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { dayBounds } from '#modules/core'
import type { Candidate, KitList, StartPullListInput } from '../shared/pull-lists'
import { checkLength } from './lending'
import { insertLoan, linesOf, moveLoan, promiseLine, windowFor, type Loan } from './loans'
import { whyNotFree } from './promise'

/** L9: the operating day of the production's last performance not cancelled, plus the grace. */
export async function productionDueBack(productionId: string): Promise<string | null> {
  const grace = Math.round((await useSetting('inventory.loans.production-grace') as number) / 86_400) // not-policy: seconds in a day
  const row = await first<{ due: string | null }>(
    'SELECT date(max(operating_day), \'+\' || ? || \' days\') AS due FROM core_performances WHERE production_id = ? AND state <> \'cancelled\'', grace, productionId)
  return row?.due ?? null
}

async function requireLiveProduction(productionId: string): Promise<void> {
  const row = await first<{ state: string }>('SELECT state FROM core_productions WHERE id = ?', productionId)
  if (!row) refuse('core.production.not-found', 'There is no such production.', { status: 404 })
  if (row.state === 'cancelled') refuse('inventory.pull-list.cancelled-production', 'This production is cancelled.', { status: 409 })
}

/** L5: a draft pull list, one per department and production (L2), due back after the last performance unless a date is given. */
export async function startPullList(unit: UnitView, input: StartPullListInput, actorId: string): Promise<string> {
  await requireLiveProduction(input.productionId)
  const followed = input.dueBackOn ? null : await productionDueBack(input.productionId)
  const dueBackOn = input.dueBackOn ?? followed
  if (!dueBackOn) refuse('inventory.pull-list.no-dates', 'This production has no performances to follow yet.', { status: 422, remedy: 'Give a date for it all to come back.' })
  if (dueBackOn < input.startsOn) refuse('inventory.loan.backwards', 'It cannot be due back before it goes out.', { status: 422 })
  await checkLength(input.startsOn, dueBackOn)
  const id = await insertLoan(unit, {
    departmentId: input.departmentId, kind: 'production', state: 'draft', productionId: input.productionId, responsibleAccountId: actorId,
    startsAt: (await dayBounds(input.startsOn)).start, dueBackOn, dueBackSet: followed ? 'from-production' : 'by-person', requestedBy: actorId,
  })
  unit.audit({ action: 'create', record: ['inventory.loan', id], detail: { kind: 'production' } })
  return id
}

/** Submitting a pull list asks the department (L3, L4); wanted lines may stay wanted (L6). */
export function submitPullList(unit: UnitView, loan: Loan, actorId: string | null): void {
  if (loan.kind !== 'production') refuse('inventory.loan.not-pull-list', 'Only a production\'s pull list is submitted.', { status: 409 })
  moveLoan(unit, loan, { to: 'requested', actor: actorId })
}

/**
 * INV-18: a wanted line gets an item of the loan's department. Before approval it is listed; once
 * the loan is approved, matching is a promise under C1 to C6 in the same unit (L6).
 */
export async function matchLine(unit: UnitView, loan: Loan, lineId: string, match: { itemId: string, quantity?: number | null }): Promise<void> {
  const line = (await linesOf(loan.id)).find(l => l.id === lineId)
  if (!line || line.state !== 'wanted') refuse('inventory.line.not-wanted', 'This line already has an item, or is gone.', { status: 409, remedy: 'Look at the loan again.' })
  const quantity = match.quantity ?? line.quantity
  unit.add(sql`UPDATE inventory_loan_lines SET item_id = ${match.itemId}, quantity = ${quantity}, state = 'listed', updated_at = ${nowMs()}
    WHERE id = ${lineId} AND loan_id = ${loan.id} AND state = 'wanted'
      AND EXISTS (SELECT 1 FROM inventory_loans o JOIN inventory_items i ON i.id = ${match.itemId} JOIN inventory_categories c ON c.id = i.category_id
        WHERE o.id = ${loan.id} AND o.state IN ('draft', 'requested', 'approved') AND c.department_id = o.department_id
          AND i.lendable = 1 AND i.state <> 'disposed' AND (i.tracking = 'counted' OR ${quantity} = 1))`)
    .expect(1, { code: 'inventory.line.wrong-item', reason: 'That item cannot go on this loan.', remedy: 'Choose an item this department lends.' })
  if (loan.state === 'approved') await promiseLine(unit, loan, { ...line, itemId: match.itemId, quantity, state: 'listed' }, await windowFor(loan.startsAt, loan.dueBackOn))
  unit.audit({ action: 'update', record: ['inventory.loan', loan.id], detail: { matchedLine: lineId } })
}

/** A production's pull lists and loans with their lines counted by state, for the Kit tab (S15). */
export async function loansForProduction(productionId: string): Promise<KitList[]> {
  const rows = await all<{ id: string, department_id: string, department: string, state: Loan['state'], due_back_on: string, due_back_at: number, wanted: number, listed: number, promised: number, out: number }>(
    `SELECT o.id, o.department_id, d.name AS department, o.state, o.due_back_on, o.due_back_at,
       count(l.id) FILTER (WHERE l.state = 'wanted') AS wanted, count(l.id) FILTER (WHERE l.state = 'listed') AS listed,
       count(l.id) FILTER (WHERE l.state = 'promised') AS promised, count(l.id) FILTER (WHERE l.state = 'out') AS out
     FROM inventory_loans o JOIN inventory_departments d ON d.id = o.department_id
     LEFT JOIN inventory_loan_lines l ON l.loan_id = o.id AND l.with_line_id IS NULL
     WHERE o.production_id = ? GROUP BY o.id ORDER BY o.state IN ('returned', 'declined', 'cancelled'), lower(d.name), o.starts_at DESC`, productionId)
  return rows.map(r => ({ id: r.id, departmentId: r.department_id, department: r.department, state: r.state, dueBackOn: r.due_back_on, dueBackAt: r.due_back_at, wanted: r.wanted, listed: r.listed, promised: r.promised, out: r.out }))
}

/** Items of the loan's department that could match a wanted line, each saying whether it is free over the window. */
export async function candidatesFor(loan: Loan, q: string): Promise<Candidate[]> {
  const like = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`
  const rows = await all<{ id: string, tag: string, name: string, tracking: Candidate['tracking'] }>(
    `SELECT i.id, i.tag, i.name, i.tracking FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id
     WHERE c.department_id = ? AND i.lendable = 1 AND i.state <> 'disposed' AND (i.tag LIKE ? ESCAPE '\\' OR i.name LIKE ? ESCAPE '\\')
     ORDER BY lower(i.name), i.tag LIMIT 20`, loan.departmentId, like, like) // not-policy: a picker's page
  const w = await windowFor(loan.startsAt, loan.dueBackOn)
  const out: Candidate[] = []
  for (const r of rows) out.push({ ...r, free: !(await whyNotFree({ itemId: r.id, quantity: 1, departmentId: loan.departmentId, window: w, except: { loanId: loan.id } })) })
  return out
}
