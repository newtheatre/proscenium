// Inspection kinds (INV-08): recurring checks with an interval, a certificate rule, a contractor rule
// and whether overdue blocks lending (N7). A changed interval moves future due dates only (N10).
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { STARTING_KINDS, type Kind } from '../shared/setup'
import type { KindInput } from './inputs'

interface KindRow { id: string, name: string, description: string | null, interval_days: number, certificate: Kind['certificate'], contractor_allowed: number, blocks_when_overdue: number, inspector_requirements: string | null, state: Kind['state'], categories: number | null }

const toKind = (r: KindRow): Kind => ({
  id: r.id,
  name: r.name,
  description: r.description,
  intervalDays: r.interval_days,
  certificate: r.certificate,
  contractorAllowed: !!r.contractor_allowed,
  blocksWhenOverdue: !!r.blocks_when_overdue,
  inspectorRequirements: JSON.parse(r.inspector_requirements ?? '[]'),
  state: r.state,
  categories: r.categories ?? 0,
})

const KIND_SELECT = `SELECT k.*, (SELECT count(*) FROM inventory_category_inspections ci JOIN inventory_categories c ON c.id = ci.category_id
    WHERE ci.kind_id = k.id AND c.state = 'active') AS categories FROM inventory_inspection_kinds k`

export async function listKinds(): Promise<Kind[]> {
  return (await all<KindRow>(`${KIND_SELECT} ORDER BY k.state = 'archived', k.sort, lower(k.name)`)).map(toKind)
}

export async function kindRow(id: string): Promise<Kind> {
  const row = await first<KindRow>(`${KIND_SELECT} WHERE k.id = ?`, id)
  return row ? toKind(row) : refuse('inventory.kind.not-found', 'There is no such inspection kind.', { status: 404 })
}

const KIND_TAKEN = { code: 'inventory.kind.taken', reason: 'There is already an inspection kind with that name.', remedy: 'Choose another name, or edit the one that exists.' }
const NAME_FREE = 'NOT EXISTS (SELECT 1 FROM inventory_inspection_kinds o WHERE o.id != ?1 AND o.state = \'active\' AND lower(o.name) = lower(?2))'

const values = (input: KindInput) => [input.name, input.description, input.intervalDays, input.certificate, input.contractorAllowed ? 1 : 0, input.blocksWhenOverdue ? 1 : 0, JSON.stringify(input.inspectorRequirements)]

export function addKind(unit: UnitView, input: KindInput): string {
  const id = newId('kik')
  unit.add({
    sql: `INSERT INTO inventory_inspection_kinds (id, name, description, interval_days, certificate, contractor_allowed, blocks_when_overdue, inspector_requirements, sort, created_at, updated_at)
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, (SELECT coalesce(max(sort), 0) + 1 FROM inventory_inspection_kinds), ?9, ?9 WHERE ${NAME_FREE}`,
    params: [id, ...values(input), nowMs()],
  }).expect(1, KIND_TAKEN)
  unit.audit({ action: 'create', record: ['inventory.inspection-kind', id], detail: { intervalDays: String(input.intervalDays) } })
  return id
}

export function updateKind(unit: UnitView, kind: Kind, input: KindInput): void {
  unit.add({
    sql: `UPDATE inventory_inspection_kinds SET name = ?2, description = ?3, interval_days = ?4, certificate = ?5, contractor_allowed = ?6, blocks_when_overdue = ?7,
            inspector_requirements = ?8, updated_at = ?9 WHERE id = ?1 AND ${NAME_FREE}`,
    params: [kind.id, ...values(input), nowMs()],
  }).expect(1, KIND_TAKEN)
  // N10: every applying due whose last inspection was a pass is that pass's date plus the new interval.
  if (kind.intervalDays !== input.intervalDays) {
    unit.add({
      sql: `UPDATE inventory_inspection_dues SET next_due_on = (SELECT date(n.done_on, '+' || ?2 || ' days') FROM inventory_inspections n WHERE n.id = inventory_inspection_dues.last_inspection_id)
             WHERE kind_id = ?1 AND applies = 1
               AND last_inspection_id IN (SELECT n.id FROM inventory_inspections n WHERE n.kind_id = ?1 AND n.result = 'pass')`,
      params: [kind.id, input.intervalDays],
    })
  }
  unit.audit({ action: 'update', record: ['inventory.inspection-kind', kind.id], detail: kind.intervalDays === input.intervalDays ? {} : { fromDays: String(kind.intervalDays), toDays: String(input.intervalDays) } })
}

// Archiving stops new dues; categories keep the link, so restoring it brings it back where it was.
export function setKindState(unit: UnitView, kind: Kind, to: 'active' | 'archived'): void {
  unit.add({
    sql: `UPDATE inventory_inspection_kinds SET state = ?2, updated_at = ?3 WHERE id = ?1 AND state != ?2
             AND (?2 = 'archived' OR NOT EXISTS (SELECT 1 FROM inventory_inspection_kinds o WHERE o.id != ?1 AND o.state = 'active' AND lower(o.name) = lower(inventory_inspection_kinds.name)))`,
    params: [kind.id, to, nowMs()],
  }).expect(1, { code: 'inventory.kind.changed', reason: 'This inspection kind changed just now, or another active kind has its name.', remedy: 'Reload the list.' })
  unit.audit({ action: 'state', record: ['inventory.inspection-kind', kind.id], detail: { to } })
}

// The four starting kinds (spec part 6), only while there are none.
export function startKinds(unit: UnitView): number {
  const at = nowMs()
  const rows = STARTING_KINDS.map((k, i) => ({ id: newId('kik'), ...k, contractorAllowed: k.contractorAllowed ? 1 : 0, blocksWhenOverdue: k.blocksWhenOverdue ? 1 : 0, sort: i + 1 }))
  unit.add({
    sql: `INSERT INTO inventory_inspection_kinds (id, name, interval_days, certificate, contractor_allowed, blocks_when_overdue, sort, created_at, updated_at)
          SELECT json_extract(value, '$.id'), json_extract(value, '$.name'), json_extract(value, '$.intervalDays'), json_extract(value, '$.certificate'),
                 json_extract(value, '$.contractorAllowed'), json_extract(value, '$.blocksWhenOverdue'), json_extract(value, '$.sort'), ?, ?
            FROM json_each(?) WHERE NOT EXISTS (SELECT 1 FROM inventory_inspection_kinds)`,
    params: [at, at, JSON.stringify(rows)],
  }).expect(rows.length, { code: 'inventory.kinds.started', reason: 'Inspection kinds have been set up already.', remedy: 'Reload the list.' })
  unit.audit({ action: 'create', detail: { startingKinds: String(rows.length) } })
  return rows.length
}
