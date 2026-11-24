// Reading the catalogue (S1, S2): the items list a person may see, by the departments they hold
// `inventory.item.view` on, and one item with its inspections, tags, contents and history.
import { all, can, first, nowMs, refuse, useSetting, type Actor } from '#kit'
import { operatingDayOf } from '#modules/core'
import type { ItemDetail, ItemRow } from '../shared/items'

// The departments this person may see the items of, or edit, by a grant anywhere above them.
export async function departmentsFor(actor: Actor, ability: 'inventory.item.view' | 'inventory.item.edit' | 'inventory.loan.view' | 'inventory.loan.approve' | 'inventory.loan.issue'): Promise<{ id: string, name: string }[]> {
  const departments = await all<{ id: string, name: string }>('SELECT id, name FROM inventory_departments WHERE state = \'active\' ORDER BY sort, lower(name)')
  const allowed: { id: string, name: string }[] = []
  for (const d of departments) if ((await can(actor, ability, ['inventory.department', d.id])).allowed) allowed.push(d)
  return allowed
}

const ITEM_SELECT = `SELECT i.id, i.tag, i.name, i.tracking, i.quantity, i.state, i.condition, i.lendable, i.category_id, c.name AS category, c.department_id, d.name AS department,
    i.home_location_id, coalesce(i.current_location_id, i.home_location_id) AS location_id, l.name AS location, i.current_location_id IS NOT NULL AS away,
    (SELECT min(next_due_on) FROM inventory_inspection_dues u WHERE u.item_id = i.id AND u.applies = 1) AS next_due_on,
    EXISTS (SELECT 1 FROM inventory_loan_lines ll WHERE ll.item_id = i.id AND ll.state = 'out') AS on_loan
  FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id JOIN inventory_departments d ON d.id = c.department_id
  JOIN inventory_locations l ON l.id = coalesce(i.current_location_id, i.home_location_id)`

interface Row { id: string, tag: string, name: string, tracking: ItemRow['tracking'], quantity: number, state: ItemRow['state'], condition: ItemRow['condition'], lendable: number, category_id: string, category: string, department_id: string, department: string, home_location_id: string, location_id: string, location: string, away: number, next_due_on: string | null, on_loan: number }

const toRow = (r: Row): ItemRow => ({
  id: r.id, tag: r.tag, name: r.name, tracking: r.tracking, quantity: r.quantity, state: r.state, condition: r.condition, lendable: !!r.lendable,
  categoryId: r.category_id, category: r.category, departmentId: r.department_id, department: r.department,
  homeLocationId: r.home_location_id, locationId: r.location_id, location: r.location, away: !!r.away, nextDueOn: r.next_due_on, onLoan: !!r.on_loan,
})

// Every item of these departments, disposed last; the screen filters and searches what comes back.
export async function listItems(departmentIds: string[]): Promise<ItemRow[]> {
  const rows = await all<Row>(`${ITEM_SELECT} WHERE c.department_id IN (SELECT value FROM json_each(?)) ORDER BY i.state = 'disposed', i.tag`, JSON.stringify(departmentIds))
  return rows.map(toRow)
}

// Today's operating day, and the last day an inspection counts as due soon (inventory.inspections.remind-before).
export async function dueWindow(): Promise<{ today: string, dueBy: string }> {
  const days = Math.round((await useSetting('inventory.inspections.remind-before') as number) / 86_400) // not-policy: seconds in a day
  const today = await operatingDayOf(nowMs())
  const row = await first<{ due_by: string }>('SELECT date(?, \'+\' || ? || \' days\') AS due_by', today, days)
  return { today, dueBy: row!.due_by }
}

export interface Label { id: string, tag: string, name: string, department: string, departmentId: string }

// What a label carries (S11), for the items asked for, in tag order.
export async function labelsFor(ids: string[]): Promise<Label[]> {
  return all<Label>(`SELECT i.id, i.tag, i.name, d.name AS department, d.id AS "departmentId" FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id
    JOIN inventory_departments d ON d.id = c.department_id WHERE i.id IN (SELECT value FROM json_each(?)) ORDER BY i.tag`, JSON.stringify(ids))
}

export async function itemByTag(tag: string): Promise<{ id: string, departmentId: string } | null> {
  const row = await first<{ id: string, department_id: string }>('SELECT i.id, c.department_id FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id WHERE i.tag = ?', tag.trim().toUpperCase())
  return row ? { id: row.id, departmentId: row.department_id } : null
}

interface DetailRow extends Row { description: string | null, make: string | null, model: string | null, serial_number: string | null, acquired_on: string | null, replacement_value: number | null, currency: string, ownership: ItemDetail['ownership'], owner_name: string | null, owner_due_back_on: string | null, requirements: string, container_id: string | null, container_tag: string | null, home_location: string, out_of_service_reason: string | null }

// I9: replacement value, owner and serial number only for those who may edit or export.
export async function itemDetail(id: string, showValues: boolean): Promise<ItemDetail> {
  const r = await first<DetailRow>(`SELECT x.*, i.description, i.make, i.model, i.serial_number, i.acquired_on, i.replacement_value, i.currency, i.ownership, i.owner_name, i.owner_due_back_on, i.requirements,
      i.container_id, k.tag AS container_tag, h.name AS home_location, i.out_of_service_reason
    FROM (${ITEM_SELECT} WHERE i.id = ?) x JOIN inventory_items i ON i.id = x.id LEFT JOIN inventory_items k ON k.id = i.container_id JOIN inventory_locations h ON h.id = i.home_location_id`, id)
  if (!r) return refuse('inventory.item.not-found', 'There is no such item.', { status: 404 })
  const [dues, tags, contents, history] = await Promise.all([
    all<{ kind_id: string, kind: string, applies: number, next_due_on: string | null, blocks: number }>(
      `SELECT u.kind_id, k.name AS kind, u.applies, u.next_due_on, k.blocks_when_overdue AS blocks FROM inventory_inspection_dues u JOIN inventory_inspection_kinds k ON k.id = u.kind_id
        WHERE u.item_id = ? ORDER BY u.applies DESC, u.next_due_on, lower(k.name)`, id),
    all<{ id: string, label: string }>('SELECT t.id, t.label FROM inventory_item_tags it JOIN core_terms t ON t.id = it.term_id WHERE it.item_id = ? ORDER BY lower(t.label)', id),
    all<{ id: string, tag: string, name: string }>('SELECT id, tag, name FROM inventory_items WHERE container_id = ? AND state != \'disposed\' ORDER BY tag', id),
    all<{ id: string, kind: string, at: number, condition: string | null, from_location: string | null, to_location: string | null }>(
      `SELECT e.id, e.kind, e.at, e.condition, f.name AS from_location, t.name AS to_location FROM inventory_item_events e
        LEFT JOIN inventory_locations f ON f.id = e.from_location_id LEFT JOIN inventory_locations t ON t.id = e.to_location_id
        WHERE e.item_id = ? ORDER BY e.at DESC, e.id DESC LIMIT 50`, id), // not-policy: the page shows the latest fifty
  ])
  return {
    ...toRow(r),
    description: r.description, make: r.make, model: r.model, acquiredOn: r.acquired_on, homeLocation: r.home_location, outOfServiceReason: r.out_of_service_reason,
    requirements: JSON.parse(r.requirements ?? '[]'), container: r.container_id ? { id: r.container_id, tag: r.container_tag! } : null,
    ownership: r.ownership, ownerDueBackOn: r.owner_due_back_on,
    staff: showValues ? { serialNumber: r.serial_number, replacementValue: r.replacement_value, currency: r.currency, ownerName: r.owner_name } : null,
    dues: dues.map(d => ({ kindId: d.kind_id, kind: d.kind, applies: !!d.applies, nextDueOn: d.next_due_on, blocks: !!d.blocks })),
    tags, contents,
    history: history.map(h => ({ id: h.id, kind: h.kind, at: h.at, condition: h.condition, from: h.from_location, to: h.to_location })),
  }
}
