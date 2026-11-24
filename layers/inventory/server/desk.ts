// The kit desk's writes (INV-22, INV-23): checking promised lines out to whoever collects, with their
// training checked at that moment, and taking them back, in part, lost or damaged (L11 to L15, K2 to K5).
import { sql } from 'drizzle-orm'
import { newId, nowMs, refuse, requireAbility, type Actor, type UnitView } from '#kit'
import { operatingDayOf } from '#modules/core'
import type { CheckOutInput, DeskLine, ReturnInput } from '../shared/desk'
import { deskLines } from './desk-reading'
import type { Loan } from './loans'
import { usableSql } from './promise'

const MOVED = { code: 'inventory.loan.moved', reason: 'Someone else has just changed this loan.', remedy: 'Look at the loan again.' }

function itemEvents(unit: UnitView, rows: { itemId: string, kind: string, condition?: string | null, faultId?: string | null }[], loanId: string, actorId: string | null): void {
  if (!rows.length) return
  unit.add({
    sql: `INSERT INTO inventory_item_events (id, item_id, kind, loan_id, fault_id, condition, actor, at)
          SELECT json_extract(value, '$.id'), json_extract(value, '$.itemId'), json_extract(value, '$.kind'), ?, json_extract(value, '$.faultId'), json_extract(value, '$.condition'), ?, ? FROM json_each(?)`,
    params: [loanId, actorId, nowMs(), JSON.stringify(rows.map(r => ({ id: newId('kev'), condition: null, faultId: null, ...r })))],
  })
}

/** Lines chosen at the desk, each a top-level line of this loan in one of these states. */
function chosen(lines: DeskLine[], ids: string[], states: DeskLine['state'][]): DeskLine[] {
  const picked = ids.map(id => lines.find(l => l.id === id && !l.withLineId && states.includes(l.state)))
  if (picked.some(l => !l)) refuse('inventory.desk.not-on-loan', 'Something chosen is not on this loan, or has already gone.', { status: 409, remedy: 'Look at the loan again.' })
  return picked as DeskLine[]
}

/** K4: any line whose collector misses a requirement needs a holder of the override, with a reason. */
async function overrideFor(actor: Actor, loan: Loan, lines: DeskLine[], reason: string | null): Promise<Set<string>> {
  const unmet = lines.filter(l => l.needs.some(n => !n.met))
  if (!unmet.length) return new Set()
  const detail = Object.fromEntries(unmet.map(l => [l.id, l.needs.filter(n => !n.met).map(n => n.ref).join(',')]))
  if (!reason) refuse('inventory.requirement.not-met', 'The person collecting does not meet what some of this kit needs.', { status: 409, detail, remedy: 'Choose someone who does, or ask someone who may override.' })
  await requireAbility(actor, 'inventory.requirement.override', ['inventory.department', loan.departmentId])
  return new Set(unmet.map(l => l.id))
}

export async function checkOut(unit: UnitView, actor: Actor, loan: Loan, input: CheckOutInput): Promise<number> {
  if (loan.state !== 'approved' && loan.state !== 'out') refuse('inventory.loan.wrong-state', `A ${loan.state} loan cannot go out.`, { status: 409 })
  const today = await operatingDayOf(nowMs())
  if (today < await operatingDayOf(loan.startsAt)) refuse('inventory.desk.too-early', 'This loan has not started yet.', { status: 409, remedy: 'Move its start, which promises it again.' })
  const collector = input.collectorAccountId ?? loan.responsibleAccountId
  const read = await deskLines(loan.id, collector)
  const lines = chosen(read, input.lines.map(l => l.lineId), ['promised'])
  const contents = read.filter(l => l.state === 'promised' && lines.some(c => c.id === l.withLineId))
  const overridden = await overrideFor(actor, loan, lines, input.overrideReason)
  const at = nowMs()
  const by = actor.accountId ?? null
  // K5: whoever collects becomes responsible; the loan is Out from its first line (L11).
  unit.add(sql`UPDATE inventory_loans SET state = 'out', out_at = coalesce(out_at, ${at}), responsible_account_id = coalesce(${input.collectorAccountId}, responsible_account_id), updated_at = ${at}
    WHERE id = ${loan.id} AND state IN ('approved', 'out')`).expect(1, MOVED)
  const window = { from: at, to: at, startDay: today }
  for (const { lineId, condition } of input.lines) {
    const line = lines.find(l => l.id === lineId)!
    unit.add(sql`UPDATE inventory_loan_lines SET state = 'out', out_at = ${at}, out_by = ${by}, out_condition = ${condition}, updated_at = ${at}
      WHERE id = ${lineId} AND state = 'promised' AND ${usableSql(line.itemId, loan.departmentId, window)}`)
      .expect(1, { code: 'inventory.desk.not-usable', reason: `${line.tag} cannot go out now: it is out of service, proposed for disposal, or overdue an inspection.`, remedy: 'Take it off the loan, or put it right first.' })
    unit.add(sql`UPDATE inventory_loan_lines SET state = 'out', out_at = ${at}, out_by = ${by}, out_condition = (SELECT condition FROM inventory_items WHERE id = inventory_loan_lines.item_id), updated_at = ${at}
      WHERE with_line_id = ${lineId} AND state = 'promised'`)
    unit.add(sql`UPDATE inventory_items SET condition = ${condition}, updated_at = ${at} WHERE id = ${line.itemId}`)
    if (overridden.has(lineId)) unit.add(sql`UPDATE inventory_loan_lines SET requirement_overridden_by = ${by} WHERE id = ${lineId}`) // exact-account: records who overrode, reads nobody's rows
  }
  itemEvents(unit, [...lines.map(l => ({ itemId: l.itemId, kind: 'checked-out', condition: input.lines.find(c => c.lineId === l.id)!.condition })), ...contents.map(l => ({ itemId: l.itemId, kind: 'checked-out' }))], loan.id, by)
  unit.audit({ action: 'update', record: ['inventory.loan', loan.id], detail: { checkedOut: String(lines.length), ...(overridden.size ? { overrideReason: input.overrideReason!, overridden: [...overridden].join(',') } : {}) } })
  return lines.length
}

/** L14: damage opens a fault from the return, taking the item out of service, in the same unit. */
function openFault(unit: UnitView, loan: Loan, line: DeskLine, fault: { description: string, actorId: string | null }): string {
  const id = newId('kft')
  const at = nowMs()
  unit.add(sql`INSERT INTO inventory_faults (id, item_id, state, takes_out_of_service, description, source, loan_id, production_id, reported_by, created_at, updated_at)
    VALUES (${id}, ${line.itemId}, 'open', 1, ${fault.description}, 'return', ${loan.id}, ${loan.productionId}, ${fault.actorId}, ${at}, ${at})`)
  unit.add(sql`UPDATE inventory_items SET state = 'out-of-service', out_of_service_reason = 'fault', updated_at = ${at} WHERE id = ${line.itemId} AND state = 'active'`)
  return id
}

type Returned = ReturnInput['lines'][number]

/** L13: an individual item lost is missing; a counted line lost waits for disposals (INV-34). */
function markLost(unit: UnitView, line: DeskLine, at: number, by: string | null): void {
  unit.add(sql`UPDATE inventory_loan_lines SET state = 'lost', returned_at = ${at}, returned_by = ${by}, updated_at = ${at} WHERE (id = ${line.id} OR with_line_id = ${line.id}) AND state = 'out'`)
  if (line.tracking === 'individual') {
    unit.add(sql`UPDATE inventory_items SET state = 'missing', out_of_service_reason = NULL, updated_at = ${at}
      WHERE (id = ${line.itemId} OR container_id = ${line.itemId}) AND state IN ('active', 'out-of-service')`)
  }
}

/** L13: so many come back; the line is Returned once all have, its contents with it. */
function takeBack(unit: UnitView, line: DeskLine, r: Returned, by: string | null): void {
  const at = nowMs()
  const quantity = line.tracking === 'counted' ? r.quantity ?? line.quantity - line.returnedQuantity : 1
  unit.add(sql`UPDATE inventory_loan_lines SET returned_quantity = coalesce(returned_quantity, 0) + ${quantity}, returned_condition = ${r.condition}, returned_by = ${by},
      state = CASE WHEN coalesce(returned_quantity, 0) + ${quantity} >= quantity THEN 'returned' ELSE 'out' END,
      returned_at = CASE WHEN coalesce(returned_quantity, 0) + ${quantity} >= quantity THEN ${at} END, updated_at = ${at}
    WHERE id = ${line.id} AND state = 'out' AND coalesce(returned_quantity, 0) + ${quantity} <= quantity`)
    .expect(1, { code: 'inventory.desk.too-many', reason: `More of ${line.tag} than went out.`, remedy: 'Count again.' })
  unit.add(sql`UPDATE inventory_loan_lines SET state = 'returned', returned_quantity = quantity, returned_condition = ${r.condition}, returned_by = ${by}, returned_at = ${at}, updated_at = ${at}
    WHERE with_line_id = ${line.id} AND state = 'out'`)
  unit.add(sql`UPDATE inventory_items SET condition = ${r.condition}, updated_at = ${at} WHERE id = ${line.itemId} OR container_id = ${line.itemId}`)
}

export async function returnLines(unit: UnitView, actorId: string | null, loan: Loan, input: ReturnInput): Promise<void> {
  if (loan.state !== 'out') refuse('inventory.loan.wrong-state', 'Only a loan that is out can come back.', { status: 409 })
  const all = await deskLines(loan.id, null)
  const lines = chosen(all, input.lines.map(l => l.lineId), ['out'])
  const at = nowMs()
  const events: Parameters<typeof itemEvents>[1] = []
  for (const [i, line] of lines.entries()) {
    const r = input.lines[i]!
    if (r.lost) {
      markLost(unit, line, at, actorId)
      if (line.tracking === 'individual') events.push({ itemId: line.itemId, kind: 'marked-missing' })
      continue
    }
    takeBack(unit, line, r, actorId)
    const faultId = r.condition === 'damaged' ? openFault(unit, loan, line, { description: r.fault!, actorId }) : null
    if (faultId) unit.add(sql`UPDATE inventory_loan_lines SET fault_id = ${faultId} WHERE id = ${line.id}`)
    events.push({ itemId: line.itemId, kind: 'returned', condition: r.condition, faultId })
    if (faultId) events.push({ itemId: line.itemId, kind: 'fault-reported', faultId })
  }
  itemEvents(unit, events, loan.id, actorId)
  // L15: the loan is Returned by the unit that clears its last promised or out line.
  unit.add(sql`UPDATE inventory_loans SET state = 'returned', returned_at = ${at}, updated_at = ${at}
    WHERE id = ${loan.id} AND state = 'out' AND NOT EXISTS (SELECT 1 FROM inventory_loan_lines WHERE loan_id = ${loan.id} AND state IN ('promised', 'out'))`)
  unit.audit({ action: 'update', record: ['inventory.loan', loan.id], detail: { returned: String(lines.length) } })
}
