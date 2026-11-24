// Members borrowing kit (INV-20, INV-27; L3, L4, I9): the catalogue a member may browse, free or not
// over their dates, and a request split into one loan per department (L2).
import { sql } from 'drizzle-orm'
import { all, inAccountScope, nowMs, refuse, useDb, useSetting, type UnitView } from '#kit'
import { dayBounds } from '#modules/core'
import type { CatalogueItem, RequestKitInput } from '../shared/borrowing'
import type { LoanRow } from '../shared/loans'
import { checkLength } from './lending'
import { LOAN_SELECT, toRow, type Row } from './loan-reading'
import { addLine, insertLoan, windowFor, type Loan } from './loans'
import { heldSql, usableSql } from './promise'

export async function requireBrowsing(): Promise<void> {
  if (!(await useSetting('inventory.catalogue.members-browse'))) refuse('inventory.catalogue.closed', 'Borrowing kit is not open to members at the moment.', { status: 404 })
}

const LENDS_TO_MEMBERS = sql`d.state = 'active' AND ct.state = 'active' AND d.lends_to IN ('members', 'anyone')`

/** Lendable items of departments that lend to members, each with how many are free over the dates (C1 to C4), if given. */
export async function catalogue(dates: { startsOn?: string, dueBackOn?: string }): Promise<CatalogueItem[]> {
  const w = dates.startsOn && dates.dueBackOn ? await windowFor((await dayBounds(dates.startsOn)).start, dates.dueBackOn) : null
  const available = w
    ? sql`CASE WHEN ${usableSql(sql`it.id`, sql`ct.department_id`, w)} THEN max(it.quantity - ${heldSql(sql`it.id`, w, { loanId: '' }, nowMs())}, 0) ELSE 0 END`
    : sql`NULL`
  const rows = await useDb().all<{ id: string, tag: string, name: string, category: string, department_id: string, department: string, tracking: CatalogueItem['tracking'], available: number | null }>(sql`
    SELECT it.id, it.tag, it.name, ct.name AS category, d.id AS department_id, d.name AS department, it.tracking, ${available} AS available
    FROM inventory_items it JOIN inventory_categories ct ON ct.id = it.category_id JOIN inventory_departments d ON d.id = ct.department_id
    WHERE it.state = 'active' AND it.lendable = 1 AND ${LENDS_TO_MEMBERS} ORDER BY d.sort, lower(d.name), lower(it.name), it.tag`)
  return rows.map(r => ({ id: r.id, tag: r.tag, name: r.name, category: r.category, departmentId: r.department_id, department: r.department, tracking: r.tracking, available: r.available }))
}

/** L2, L4: one requested loan per department, the member responsible; the department decides. */
export async function requestKit(unit: UnitView, accountId: string, input: RequestKitInput): Promise<string[]> {
  await checkLength(input.startsOn, input.dueBackOn)
  const owners = await all<{ id: string, department_id: string }>(
    'SELECT i.id, c.department_id FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id WHERE i.id IN (SELECT value FROM json_each(?))', JSON.stringify(input.lines.map(l => l.itemId)))
  const departmentOf = new Map(owners.map(o => [o.id, o.department_id]))
  const byDepartment = new Map<string, RequestKitInput['lines']>()
  for (const line of input.lines) {
    const departmentId = departmentOf.get(line.itemId) ?? refuse('inventory.line.wrong-item', 'That item cannot be borrowed.', { status: 422 })
    byDepartment.set(departmentId, [...byDepartment.get(departmentId) ?? [], line])
  }
  const startsAt = (await dayBounds(input.startsOn)).start
  const loanIds: string[] = []
  for (const [departmentId, lines] of byDepartment) {
    const id = await insertLoan(unit, { departmentId, kind: 'member', state: 'requested', responsibleAccountId: accountId, purpose: input.purpose, startsAt, dueBackOn: input.dueBackOn, requestedBy: accountId })
    const loan = { id, departmentId, kind: 'member', state: 'requested', startsAt, dueBackOn: input.dueBackOn, dueBackAt: 0, responsibleAccountId: accountId, productionId: null } satisfies Loan
    for (const line of lines) addLine(unit, loan, line)
    unit.audit({ action: 'create', record: ['inventory.loan', id], detail: { kind: 'member', lines: String(lines.length) } })
    loanIds.push(id)
  }
  return loanIds
}

/** A member's own loans, newest first, merged accounts included. */
export async function myLoans(accountId: string): Promise<LoanRow[]> {
  const rows = await useDb().all<Row>(sql`${sql.raw(LOAN_SELECT)} WHERE ${inAccountScope('o.responsible_account_id', accountId)} ORDER BY o.starts_at DESC, o.id`)
  return rows.map(toRow)
}
