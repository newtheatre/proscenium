// Spending requests (BC-15 to BC-17, spec part 3, "The spending request"): a member asks to spend on a
// line of an approved budget; a holder of that budget, never the requester, approves or declines;
// approved, it counts as committed until claims or bills fulfil it or it lapses.
import { all, can, first, localDate, newId, nowMs, refuse, today, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { accountLabel, holdersOf, notify } from '#modules/core'
import { budgetLines, requireLine } from './budgets'
import { formatMoney } from './money'

const SECOND = 1000 // not-policy: settings are whole seconds

export type RequestState = 'requested' | 'approved' | 'declined' | 'withdrawn' | 'fulfilled' | 'lapsed'

export interface Request {
  id: string
  requestedBy: string | null
  lineId: string
  lineName: string
  budgetId: string
  budgetName: string
  currency: string
  amountMinor: number
  description: string
  neededBy: string | null
  state: RequestState
  decidedAt: number | null
  decisionNote: string | null
  fulfilledMinor: number
  lapsesOn: string | null
  createdAt: number
}

export const COLUMNS = `r.id, r.requested_by AS requestedBy, r.line_id AS lineId, l.name AS lineName, b.id AS budgetId, b.name AS budgetName,
  b.currency, r.amount_minor AS amountMinor, r.description, r.needed_by AS neededBy, r.state, r.decided_at AS decidedAt,
  r.decision_note AS decisionNote, r.fulfilled_minor AS fulfilledMinor, r.lapses_on AS lapsesOn, r.created_at AS createdAt`
export const FROM = 'FROM budgets_spending_requests r JOIN budgets_lines l ON l.id = r.line_id JOIN budgets_budgets b ON b.id = l.budget_id'

export async function requireRequest(id: string | undefined): Promise<Request> {
  const row = id ? await first<Request>(`SELECT ${COLUMNS} ${FROM} WHERE r.id = ?`, id) : null
  if (!row) refuse('core.not-found', 'There is no such request.', { status: 404 })
  return row!
}

/** Lines a request may be made against: expense lines of approved budgets, with what is left on each. */
export async function offeredLines() {
  const rows = await all<{ id: string, name: string, budgetId: string, budgetName: string, currency: string }>(
    `SELECT l.id, l.name, b.id AS budgetId, b.name AS budgetName, b.currency FROM budgets_lines l JOIN budgets_budgets b ON b.id = l.budget_id
      WHERE b.state = 'approved' AND l.kind = 'expense' AND l.archived_at IS NULL ORDER BY b.name, l.sort_order, l.name`)
  return rows
}

async function isMine(request: Request, actor: Actor): Promise<boolean> {
  if (!request.requestedBy || !actor.accountId) return false
  return !!(await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, request.requestedBy, actor.accountId))
}

/** What the actor may do with requests on this budget: hold it, or approve anything. */
async function authority(actor: Actor, budgetId: string): Promise<{ holds: boolean, any: boolean }> {
  const any = (await can(actor, 'budgets.claim.approve-any')).allowed
  return { any, holds: any || (await can(actor, 'budgets.budget.hold', ['budgets.budget', budgetId])).allowed }
}

/** Asks to spend on a line (BC-15). The line must be live in an approved budget; its holders are told. */
export async function makeRequest(unit: UnitView, actor: Actor, input: { lineId: string, amountMinor: number, description: string, neededBy?: string | null }): Promise<string> {
  const { budget, line } = await requireLine(input.lineId)
  const live = budget.state === 'approved' && line.kind === 'expense' && !line.archivedAt
  if (!live) refuse('budgets.request.line', 'Ask against a spending line of an approved budget.', { status: 422, fields: { lineId: 'not offered' } })
  const id = newId('bgr')
  unit.add({
    sql: `INSERT INTO budgets_spending_requests (id, requested_by, line_id, amount_minor, description, needed_by, state, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, 'requested', ?, ? WHERE EXISTS (SELECT 1 FROM budgets_lines l JOIN budgets_budgets b ON b.id = l.budget_id
            WHERE l.id = ? AND l.archived_at IS NULL AND b.state = 'approved')`,
    params: [id, actor.accountId ?? null, line.id, input.amountMinor, input.description, input.neededBy ?? null, nowMs(), nowMs(), line.id],
  }).expect(1, { code: 'budgets.request.line', reason: 'That line has just closed or been archived.' })
  unit.audit({ action: 'create', record: ['budgets.request', id], detail: { amountMinor: input.amountMinor } })
  const holders = (await holdersOf('budgets.budget.hold', ['budgets.budget', budget.id])).filter(h => h !== actor.accountId)
  if (holders.length) {
    await notify(unit, 'budgets.request-to-approve', {
      to: holders,
      variables: { person: actor.accountId ? await accountLabel(actor.accountId) : '', amount: await formatMoney(input.amountMinor, budget.currency), line: line.name, budget: budget.name, link: '/console/budgets/approvals' },
      subject: ['budgets.request', id],
    })
  }
  return id
}

/** How far over its budgeted amount approving this would take the line; 0 when within it. */
export async function overBy(request: Request): Promise<number> {
  const { budget } = await requireLine(request.lineId)
  const line = (await budgetLines(budget)).lines.find(l => l.id === request.lineId)
  if (!line) return 0
  return Math.max(0, request.amountMinor - line.figures.remainingMinor)
}

/**
 * Approves or declines (BC-16): a holder of the line's budget who is not the requester. Over budget
 * only the treasurer approves (C3), and the refusal says by how much. Approval sets when it lapses.
 */
export async function decide(unit: UnitView, actor: Actor, request: Request, decision: { approve: boolean, note?: string | null }): Promise<void> {
  if (request.state !== 'requested') refuse('budgets.request.state', `This request is ${request.state}; only one waiting can be decided.`, { status: 409 })
  if (await isMine(request, actor)) refuse('budgets.request.own', 'You asked for this, so someone else decides it.', { status: 403, remedy: 'Ask another holder of the budget, or the treasurer.' })
  const { holds, any } = await authority(actor, request.budgetId)
  if (!holds) refuse('budgets.request.not-holder', 'Only a holder of this budget, or the treasurer, decides its requests.', { status: 403 })
  const at = nowMs()
  let lapsesOn: string | null = null
  if (decision.approve) {
    const over = await overBy(request)
    if (over > 0 && !any) refuse('budgets.request.over-budget', 'Approving this would take the line over budget, so the treasurer decides it.', { status: 409, detail: { overMinor: String(over) }, remedy: 'Leave it for the treasurer, or decline it.' })
    lapsesOn = await localDate(at + (await useSetting('budgets.requests.lapse-after') as number) * SECOND)
  }
  const state = decision.approve ? 'approved' : 'declined'
  unit.add({
    // The requester's own decision is refused on the statement too, through the account scope.
    sql: `UPDATE budgets_spending_requests SET state = ?1, decided_by = ?2, decided_at = ?3, decision_note = ?4, lapses_on = ?5, updated_at = ?3 WHERE id = ?6 AND state = 'requested' AND (requested_by IS NULL OR requested_by NOT IN (${accountScopeSql('?2')}))`, // not-policy: numbered parameters
    params: [state, actor.accountId ?? null, at, decision.note ?? null, lapsesOn, request.id],
  }).expect(1, { code: 'budgets.request.state', reason: 'Someone has just decided this request.' })
  unit.audit({ action: 'state', record: ['budgets.request', request.id], detail: { from: 'requested', to: state } })
  unit.announce('budgets.request.decided', { requestId: request.id, decision: state, amountMinor: request.amountMinor }, { record: ['budgets.request', request.id] })
  if (request.requestedBy) {
    await notify(unit, 'budgets.request-decided', {
      to: request.requestedBy,
      variables: { amount: await formatMoney(request.amountMinor, request.currency), line: request.lineName, decision: decision.approve ? 'approved' : 'declined', note: decision.note || await lapseWords(lapsesOn!), link: '/members/expenses' },
      subject: ['budgets.request', request.id],
    })
  }
}

/** What an approval tells the requester: until when the money is set aside. */
async function lapseWords(on: string): Promise<string> {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${on}T12:00:00Z`))
  return `The money is set aside until ${day}; claim it before then.`
}

/** Withdraws a request nothing has been spent against: its requester, a holder, or the treasurer. */
export async function withdraw(unit: UnitView, actor: Actor, request: Request): Promise<void> {
  if (!(await isMine(request, actor)) && !(await authority(actor, request.budgetId)).holds)
    refuse('budgets.request.not-yours', 'Only whoever asked, or a holder of the budget, withdraws a request.', { status: 403 })
  if (!['requested', 'approved'].includes(request.state) || request.fulfilledMinor > 0)
    refuse('budgets.request.state', 'Only a request that is waiting, or approved with nothing spent against it, can be withdrawn.', { status: 409 })
  unit.add({
    sql: "UPDATE budgets_spending_requests SET state = 'withdrawn', updated_at = ? WHERE id = ? AND state IN ('requested', 'approved') AND fulfilled_minor = 0",
    params: [nowMs(), request.id],
  }).expect(1, { code: 'budgets.request.state', reason: 'This request has just changed.' })
  unit.audit({ action: 'state', record: ['budgets.request', request.id], detail: { from: request.state, to: 'withdrawn' } })
}

/** The person's own requests, open ones first, newest first. */
export async function myRequests(accountId: string): Promise<Request[]> {
  return all<Request>(
    `SELECT ${COLUMNS} ${FROM} WHERE r.requested_by IN (${accountScopeSql('?1')})
      ORDER BY r.state NOT IN ('requested', 'approved'), r.created_at DESC`, accountId)
}

/** Requests waiting on this person (BC-16): on budgets they hold, or all for the treasurer; not their own; oldest first. */
export async function waitingOn(actor: Actor): Promise<(Request & { overMinor: number })[]> {
  if (!actor.accountId) return []
  const rows = await all<Request>(
    `SELECT ${COLUMNS} ${FROM} WHERE r.state = 'requested' AND (r.requested_by IS NULL OR r.requested_by NOT IN (${accountScopeSql('?1')}))
      ORDER BY r.created_at`, actor.accountId)
  const allowed = new Map<string, boolean>()
  const out: (Request & { overMinor: number })[] = []
  for (const row of rows) {
    if (!allowed.has(row.budgetId)) allowed.set(row.budgetId, (await authority(actor, row.budgetId)).holds)
    if (allowed.get(row.budgetId)) out.push({ ...row, overMinor: await overBy(row) })
  }
  return out
}

/** The daily task (BC-17): approved requests past their date lapse; decided ones past retention lose their requester and words. */
export async function daily(unit: UnitView): Promise<void> {
  const on = await today()
  unit.add({ sql: "UPDATE budgets_spending_requests SET state = 'lapsed', updated_at = ? WHERE state = 'approved' AND lapses_on < ?", params: [nowMs(), on] })
  const keep = await useSetting('budgets.retention.requests') as number
  unit.add({
    sql: `UPDATE budgets_spending_requests SET requested_by = NULL, description = '', decision_note = NULL
          WHERE state IN ('declined', 'withdrawn', 'fulfilled', 'lapsed') AND requested_by IS NOT NULL AND updated_at < ?`,
    params: [nowMs() - keep * SECOND],
  })
}

/** Requests that keep a budget open: waiting, or approved and not yet fulfilled or lapsed. */
export async function openOn(budgetId: string): Promise<number> {
  const row = await first<{ n: number }>(
    "SELECT count(*) AS n FROM budgets_spending_requests WHERE state IN ('requested', 'approved') AND line_id IN (SELECT id FROM budgets_lines WHERE budget_id = ?)", budgetId)
  return row?.n ?? 0
}
