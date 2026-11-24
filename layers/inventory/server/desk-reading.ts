// What the kit desk reads (S6): the loan a scan opens, and one loan with its lines and what each needs
// of the person collecting, checked at this moment (K1 to K3).
import { all, first, nowMs, refuse, requirements } from '#kit'
import { operatingDayOf } from '#modules/core'
import type { DeskLine, DeskLoan, DeskNeed } from '../shared/desk'

/**
 * A scanned code: a loan id, an item's label address or its tag. An item opens the loan it is out on,
 * else the one it is promised to whose window starts soonest.
 */
export async function scanLoan(code: string): Promise<string> {
  const trimmed = code.trim()
  const loan = await first<{ id: string }>('SELECT id FROM inventory_loans WHERE id = ?', trimmed)
  if (loan) return loan.id
  const itemId = /\/console\/inventory\/items\/([^/?#]+)/.exec(trimmed)?.[1]
  const row = await first<{ loan_id: string }>(`SELECT l.loan_id FROM inventory_loan_lines l JOIN inventory_items i ON i.id = l.item_id JOIN inventory_loans o ON o.id = l.loan_id
    WHERE (i.id = ? OR lower(i.tag) = lower(?)) AND l.state IN ('out', 'promised') AND o.state IN ('approved', 'out')
    ORDER BY l.state = 'out' DESC, o.starts_at LIMIT 1`, itemId ?? '', trimmed) // not-policy: the one loan to open
  return row?.loan_id ?? refuse('inventory.desk.not-on-loan', 'That item is not on a loan waiting to go out or come back.', { status: 404, remedy: 'Check the tag, or look the loan up on the loans list.' })
}

interface LineRow { id: string, item_id: string, tag: string, name: string, tracking: DeskLine['tracking'], quantity: number, returned_quantity: number | null, state: DeskLine['state'], condition: DeskLine['condition'], with_line_id: string | null, refs: string }

// K1: a line needs its department's, its category's and its item's requirements together.
const LINES = `SELECT l.id, l.item_id, i.tag, i.name, i.tracking, l.quantity, l.returned_quantity, l.state, i.condition, l.with_line_id,
    json_array(json(d.requirements), json(c.requirements), json(i.requirements)) AS refs
  FROM inventory_loan_lines l JOIN inventory_items i ON i.id = l.item_id JOIN inventory_categories c ON c.id = i.category_id
  JOIN inventory_departments d ON d.id = c.department_id
  WHERE l.loan_id = ? AND l.state IN ('promised', 'out', 'returned', 'lost') ORDER BY l.sort, l.created_at, l.id`

const refsOf = (r: LineRow): string[] => [...new Set((JSON.parse(r.refs) as string[][]).flat())]

/** K3: one call, now, an unavailable source counting as met but shown as not checked. No account meets nothing (K5). */
export async function needsFor(accountId: string | null, refs: string[]): Promise<Map<string, DeskNeed>> {
  const out = new Map<string, DeskNeed>()
  if (!refs.length) return out
  const labels = await requirements.describe(refs)
  const answers = accountId ? await requirements.check({ accounts: [accountId], refs, at: nowMs(), whenUnavailable: 'met' }) : []
  for (const ref of refs) {
    const answer = answers.find(a => a.ref === ref)
    out.set(ref, { ref, label: labels[ref]?.label ?? ref, met: answer?.verdict === 'met', checked: !!answer && !answer.unavailable })
  }
  return out
}

export async function deskLines(loanId: string, accountId: string | null): Promise<DeskLine[]> {
  const rows = await all<LineRow>(LINES, loanId)
  const needs = await needsFor(accountId, [...new Set(rows.flatMap(refsOf))])
  return rows.map(r => ({
    id: r.id, itemId: r.item_id, tag: r.tag, name: r.name, tracking: r.tracking, quantity: r.quantity, returnedQuantity: r.returned_quantity ?? 0,
    state: r.state, condition: r.condition, withLineId: r.with_line_id, needs: refsOf(r).map(ref => needs.get(ref)!),
  }))
}

/** One loan for the desk; needs are checked against whoever is collecting, the responsible person unless another is named (K5). */
export async function deskLoan(id: string, canOverride: boolean, collectorId: string | null = null): Promise<DeskLoan> {
  const r = await first<{ id: string, kind: DeskLoan['kind'], state: DeskLoan['state'], department: string, borrower: string, responsible_account_id: string | null, responsible: string | null, starts_at: number, due_back_on: string }>(
    `SELECT o.id, o.kind, o.state, d.name AS department, o.responsible_account_id, CASE WHEN a.anonymised_at IS NULL THEN a.name END AS responsible,
       coalesce(p.title, CASE WHEN a.anonymised_at IS NULL THEN a.name END, o.borrower_name, '') AS borrower, o.starts_at, o.due_back_on
     FROM inventory_loans o JOIN inventory_departments d ON d.id = o.department_id
     LEFT JOIN core_productions p ON p.id = o.production_id LEFT JOIN core_accounts a ON a.id = o.responsible_account_id WHERE o.id = ?`, id)
  if (!r) return refuse('inventory.loan.not-found', 'There is no such loan.', { status: 404 })
  return {
    id: r.id, kind: r.kind, state: r.state, department: r.department, borrower: r.borrower,
    responsible: r.responsible_account_id ? { id: r.responsible_account_id, name: r.responsible ?? '' } : null,
    startsAt: r.starts_at, dueBackOn: r.due_back_on, startsLater: (await operatingDayOf(nowMs())) < (await operatingDayOf(r.starts_at)),
    canOverride, lines: await deskLines(r.id, collectorId ?? r.responsible_account_id),
  }
}
