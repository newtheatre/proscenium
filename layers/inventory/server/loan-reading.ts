// Reading loans (S4, S5): the loans of the departments a person may see, and one loan with its lines,
// each line saying whether its item is free over the window as the promise would ask it.
import { all, first, refuse } from '#kit'
import type { LoanDetail, LoanLine, LoanRow } from '../shared/loans'
import { windowFor } from './loans'
import { whyNotFree } from './promise'

// The borrower in words: the production, the member's name, or the outside borrower's.
const LOAN_SELECT = `SELECT o.id, o.kind, o.state, o.department_id, d.name AS department, o.starts_at, o.due_back_on, o.due_back_at,
    coalesce(p.title, CASE WHEN a.anonymised_at IS NULL THEN a.name END, o.borrower_name, '') AS borrower,
    (SELECT count(*) FROM inventory_loan_lines l WHERE l.loan_id = o.id AND l.state <> 'cancelled' AND l.with_line_id IS NULL) AS lines
  FROM inventory_loans o JOIN inventory_departments d ON d.id = o.department_id
  LEFT JOIN core_productions p ON p.id = o.production_id LEFT JOIN core_accounts a ON a.id = o.responsible_account_id`

interface Row { id: string, kind: LoanRow['kind'], state: LoanRow['state'], department_id: string, department: string, starts_at: number, due_back_on: string, due_back_at: number, borrower: string, lines: number }

const toRow = (r: Row): LoanRow => ({
  id: r.id, kind: r.kind, state: r.state, departmentId: r.department_id, department: r.department, borrower: r.borrower,
  startsAt: r.starts_at, dueBackOn: r.due_back_on, dueBackAt: r.due_back_at, lines: r.lines,
})

// Every loan of these departments that is not a draft pull list, newest window first.
export async function listLoans(departmentIds: string[]): Promise<LoanRow[]> {
  const rows = await all<Row>(`${LOAN_SELECT} WHERE o.department_id IN (SELECT value FROM json_each(?)) AND o.state <> 'draft' ORDER BY o.starts_at DESC, o.id`, JSON.stringify(departmentIds))
  return rows.map(toRow)
}

interface LineRow { id: string, item_id: string | null, tag: string | null, name: string | null, wanted: string | null, quantity: number, state: LoanLine['state'], with_line_id: string | null }

async function linesWithFreedom(loan: Row): Promise<LoanLine[]> {
  const rows = await all<LineRow>(`SELECT l.id, l.item_id, i.tag, i.name, l.wanted, l.quantity, l.state, l.with_line_id FROM inventory_loan_lines l
    LEFT JOIN inventory_items i ON i.id = l.item_id WHERE l.loan_id = ? ORDER BY l.sort, l.id`, loan.id)
  const w = await windowFor(loan.starts_at, loan.due_back_on)
  const out: LoanLine[] = []
  for (const r of rows) {
    const asked = r.item_id && (r.state === 'listed' || r.state === 'wanted')
    const why = asked ? await whyNotFree({ itemId: r.item_id!, quantity: r.quantity, departmentId: loan.department_id, window: w, except: { lineId: r.id } }) : null
    out.push({
      id: r.id, itemId: r.item_id, tag: r.tag, name: r.name, wanted: r.wanted, quantity: r.quantity, state: r.state, withLineId: r.with_line_id,
      free: asked ? (why ? { free: false, reason: why.reason } : { free: true }) : null,
    })
  }
  return out
}

export async function loanDetail(id: string, can: LoanDetail['can']): Promise<LoanDetail> {
  const r = await first<Row & { production_id: string | null, purpose: string | null, borrower_email: string | null, decline_note: string | null }>(
    `SELECT x.*, o.production_id, o.purpose, o.borrower_email, o.decline_note FROM (${LOAN_SELECT} WHERE o.id = ?) x JOIN inventory_loans o ON o.id = x.id`, id)
  if (!r) return refuse('inventory.loan.not-found', 'There is no such loan.', { status: 404 })
  return { ...toRow(r), productionId: r.production_id, purpose: r.purpose, borrowerEmail: r.borrower_email, declineNote: r.decline_note, lineList: await linesWithFreedom(r), can }
}
