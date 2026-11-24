// The promise check (C1 to C4, C6; part 8, the lending proof). It lives in the statement that moves a
// line to Promised, never in a read before it, so of two approvers promising the last haze machine at
// once exactly one succeeds and the other is refused `inventory.loan.clash`.
import { sql, type SQL } from 'drizzle-orm'
import { nowMs, useDb } from '#kit'

export const CLASH = { code: 'inventory.loan.clash', reason: 'Someone else has just been promised this item for that time.', remedy: 'Choose other dates or another item.' }

export interface Window {
  /** When the items are wanted from. */
  from: number
  /** The close of the due-back date's operating day (L8). */
  to: number
  /** The operating day the window starts on, for the overdue-inspection rule (N7). */
  startDay: string
}

/** What a promise leaves out of its count: the line itself, or every line of a loan being re-dated. */
export type Except = { lineId: string } | { loanId: string }

const except = (e: Except): SQL => 'lineId' in e ? sql`l.id <> ${e.lineId}` : sql`l.loan_id <> ${e.loanId}`

/**
 * How many of the item other lines hold over the window: Promised and Out lines whose loan's window
 * overlaps it, an Out line past its due time counting to the right end (C3), and only what is not
 * yet back of a counted line returned in part.
 */
export function heldSql(itemId: SQL | string, w: Window, e: Except, at = nowMs()): SQL {
  return sql`coalesce((SELECT sum(l.quantity - coalesce(l.returned_quantity, 0)) FROM inventory_loan_lines l JOIN inventory_loans o ON o.id = l.loan_id
    WHERE l.item_id = ${itemId} AND l.state IN ('promised', 'out') AND ${except(e)} AND o.starts_at < ${w.to}
      AND (o.due_back_at > ${w.from} OR (l.state = 'out' AND o.due_back_at <= ${at}))), 0)`
}

/**
 * C4: the item may be promised at all. Active, lendable, in a category of the loan's department
 * (L2), not proposed for disposal (D1), and not overdue on a blocking inspection before the window
 * starts (N7).
 */
export function usableSql(itemId: SQL | string, departmentId: string, w: Window): SQL {
  return sql`EXISTS (SELECT 1 FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id
      WHERE i.id = ${itemId} AND i.state = 'active' AND i.lendable = 1 AND c.department_id = ${departmentId})
    AND NOT EXISTS (SELECT 1 FROM inventory_disposals d WHERE d.item_id = ${itemId} AND d.state IN ('proposed', 'approved'))
    AND NOT EXISTS (SELECT 1 FROM inventory_inspection_dues u JOIN inventory_inspection_kinds k ON k.id = u.kind_id
      WHERE u.item_id = ${itemId} AND u.applies = 1 AND k.blocks_when_overdue = 1 AND k.state = 'active' AND u.next_due_on IS NOT NULL AND u.next_due_on < ${w.startDay})`
}

/** C1 to C4 for `quantity` of an item over a window: one predicate for a statement to carry. */
export function freeSql(itemId: SQL | string, quantity: number, departmentId: string, w: Window, e: Except, at = nowMs()): SQL {
  return sql`${usableSql(itemId, departmentId, w)}
    AND (SELECT i.quantity FROM inventory_items i WHERE i.id = ${itemId}) >= ${quantity} + ${heldSql(itemId, w, e, at)}`
}

export type Unfree = 'not-usable' | 'taken'

export interface Taken { reason: Unfree, loanIds: string[] }

/**
 * The same check as a read, for a screen that names what is in the way (L7) and for `isPromisable`.
 * Never a guard on its own: the statement carries the predicate again.
 */
export async function whyNotFree(itemId: string, quantity: number, departmentId: string, w: Window, e: Except): Promise<Taken | null> {
  const db = useDb()
  const at = nowMs()
  const [usable] = await db.all<{ ok: number }>(sql`SELECT ${usableSql(itemId, departmentId, w)} AS ok`)
  if (!usable?.ok) return { reason: 'not-usable', loanIds: [] }
  const [fits] = await db.all<{ ok: number }>(sql`SELECT (SELECT quantity FROM inventory_items WHERE id = ${itemId}) >= ${quantity} + ${heldSql(itemId, w, e, at)} AS ok`)
  if (fits?.ok) return null
  const others = await db.all<{ loan_id: string }>(sql`SELECT DISTINCT l.loan_id FROM inventory_loan_lines l JOIN inventory_loans o ON o.id = l.loan_id
    WHERE l.item_id = ${itemId} AND l.state IN ('promised', 'out') AND ${except(e)} AND o.starts_at < ${w.to}
      AND (o.due_back_at > ${w.from} OR (l.state = 'out' AND o.due_back_at <= ${at})) ORDER BY l.loan_id`)
  return { reason: 'taken', loanIds: others.map(o => o.loan_id) }
}
