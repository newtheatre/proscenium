// Adding and changing items (INV-10, INV-11). One unit adds an item, or several alike, with its tag,
// its `added` event, its tags and one due per inspection its category needs (I1, I2, N1, N4).
import { first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { operatingDayOf } from '#modules/core'
import type { Category } from '../shared/setup'
import type { ItemInput, NewItemsInput } from './inputs'

const ITEM_PLACE = { code: 'inventory.item.place', reason: 'Its category or department is archived, its home is archived, or its container cannot hold it.', remedy: 'Reload and choose again.' }
const TAGS_GONE = { code: 'inventory.item.tag-gone', reason: 'One of the tags chosen is retired or no longer exists.', remedy: 'Reload and choose again.' }

// The columns an item's details fill, in order, for the statements below.
const DETAIL_COLUMNS = ['name', 'description', 'home_location_id', 'condition', 'lendable', 'make', 'model', 'serial_number', 'acquired_on', 'replacement_value', 'ownership', 'owner_name', 'owner_due_back_on', 'requirements']
const detailValues = (input: NewItemsInput | ItemInput) => [
  input.name, input.description, input.homeLocationId, input.condition, input.lendable ? 1 : 0, input.make, input.model, input.serialNumber,
  input.acquiredOn, input.replacementValue, input.ownership, input.ownership === 'owned' ? null : input.ownerName,
  input.ownership === 'owned' ? null : input.ownerDueBackOn, JSON.stringify(input.requirements),
]

// The details set from parameter six on, after the five every change names.
const DETAIL_SET = DETAIL_COLUMNS.map((c, i) => `${c} = ?${i + 6}`).join(', ') // not-policy: parameter numbers

// A container is an individual item that is in no container itself (I6).
const CONTAINER_OK = `(?3 IS NULL OR EXISTS (SELECT 1 FROM inventory_items k WHERE k.id = ?3 AND k.tracking = 'individual' AND k.container_id IS NULL AND k.state != 'disposed'))`

export async function addItems(unit: UnitView, category: Category, input: NewItemsInput, actorId: string | null): Promise<string[]> {
  if (category.state !== 'active') refuse('inventory.category.archived', 'This category is archived.', { remedy: 'Restore it, or choose another.' })
  const count = input.tracking === 'individual' ? input.count : 1
  const limit = await useSetting('core.units.set-rows-limit') as number
  if (count > limit) refuse('inventory.items.too-many', `At most ${limit} items can be added at once.`, { detail: { limit: String(limit) } })
  if (input.containerId && input.tracking === 'counted') refuse('inventory.item.counted-in-container', 'A counted item cannot go in a container.')
  const ids = Array.from({ length: count }, () => newId('kit'))
  const at = nowMs()
  const today = await operatingDayOf(at)
  // I2: each tag is the department's counter plus the item's place in the run, read inside the statement.
  unit.add({
    sql: `INSERT INTO inventory_items (id, category_id, tag, tracking, quantity, container_id, currency, created_by, created_at, updated_at, ${DETAIL_COLUMNS.join(', ')})
          SELECT j.value, c.id, d.tag_prefix || '-' || printf('%04d', d.next_tag_number + j.key), ?4, ?5, ?3, ?6, ?7, ?8, ?8, ${DETAIL_COLUMNS.map((_, i) => `?${i + 9}`).join(', ')}
            FROM json_each(?1) j JOIN inventory_categories c ON c.id = ?2 JOIN inventory_departments d ON d.id = c.department_id
           WHERE c.state = 'active' AND d.state = 'active' AND ${CONTAINER_OK}
             AND EXISTS (SELECT 1 FROM inventory_locations l WHERE l.id = ?11 AND l.state = 'active')`,
    params: [JSON.stringify(ids), category.id, input.containerId, input.tracking, input.tracking === 'counted' ? input.quantity : 1, await useSetting('core.locale.currency'), actorId, at, ...detailValues(input)],
  }).expect(count, ITEM_PLACE)
  unit.add({ sql: 'UPDATE inventory_departments SET next_tag_number = next_tag_number + ? WHERE id = ?', params: [count, category.departmentId] }).expect(1, ITEM_PLACE)
  unit.add({
    sql: `INSERT INTO inventory_item_events (id, item_id, kind, to_location_id, condition, actor, at)
          SELECT json_extract(value, '$.id'), json_extract(value, '$.item'), 'added', ?, ?, ?, ? FROM json_each(?)`,
    params: [input.homeLocationId, input.condition, actorId, at, JSON.stringify(ids.map(item => ({ id: newId('kev'), item })))],
  })
  setTags(unit, ids, input.tagIds)
  if (input.tracking === 'individual') await addDues(unit, ids, category.id, today)
  unit.audit({ action: 'create', record: ['inventory.item', ids[0]!], detail: { count: String(count), tracking: input.tracking } })
  return ids
}

// The item's tags become exactly these, each a live term of `inventory.tag`.
function setTags(unit: UnitView, itemIds: string[], tagIds: string[]): void {
  const items = JSON.stringify(itemIds)
  unit.add({ sql: 'DELETE FROM inventory_item_tags WHERE item_id IN (SELECT value FROM json_each(?))', params: [items] })
  if (!tagIds.length) return
  unit.add({
    sql: `INSERT INTO inventory_item_tags (item_id, term_id) SELECT i.value, t.id FROM json_each(?) i, core_terms t
           WHERE t.id IN (SELECT value FROM json_each(?)) AND t.vocabulary_key = 'inventory.tag' AND t.retired_at IS NULL`,
    params: [items, JSON.stringify([...new Set(tagIds)])],
  }).expect(itemIds.length * new Set(tagIds).size, TAGS_GONE)
}

// N1 and N4: one due per kind the category needs, today or one interval on, by the setting.
async function addDues(unit: UnitView, itemIds: string[], categoryId: string, today: string, revive = false): Promise<void> {
  const afterInterval = await useSetting('inventory.inspections.first-due') === 'after-interval'
  unit.add({
    sql: `INSERT INTO inventory_inspection_dues (item_id, kind_id, source, applies, next_due_on)
          SELECT i.value, k.id, 'category', 1, CASE WHEN ?1 THEN date(?2, '+' || k.interval_days || ' days') ELSE ?2 END
            FROM json_each(?3) i, inventory_category_inspections ci JOIN inventory_inspection_kinds k ON k.id = ci.kind_id
           WHERE ci.category_id = ?4 AND k.state = 'active'
          ON CONFLICT (item_id, kind_id) DO UPDATE SET applies = 1, next_due_on = excluded.next_due_on
           WHERE ?5 AND inventory_inspection_dues.source = 'category' AND inventory_inspection_dues.applies = 0`,
    params: [afterInterval ? 1 : 0, today, JSON.stringify(itemIds), categoryId, revive ? 1 : 0],
  })
}

export interface ItemCore { id: string, categoryId: string, departmentId: string, tracking: 'individual' | 'counted', quantity: number, state: string, condition: string, homeLocationId: string, containerId: string | null }

export async function itemCore(id: string): Promise<ItemCore> {
  const row = await first<{ id: string, category_id: string, department_id: string, tracking: ItemCore['tracking'], quantity: number, state: string, condition: string, home_location_id: string, container_id: string | null }>(
    'SELECT i.id, i.category_id, c.department_id, i.tracking, i.quantity, i.state, i.condition, i.home_location_id, i.container_id FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id WHERE i.id = ?', id)
  if (!row) return refuse('inventory.item.not-found', 'There is no such item.', { status: 404 })
  return { id: row.id, categoryId: row.category_id, departmentId: row.department_id, tracking: row.tracking, quantity: row.quantity, state: row.state, condition: row.condition, homeLocationId: row.home_location_id, containerId: row.container_id }
}

// I4: tracking is fixed once the item has been on a loan or inspected.
const TRACKING_FREE = `(?2 = inventory_items.tracking OR (NOT EXISTS (SELECT 1 FROM inventory_loan_lines WHERE item_id = ?1) AND NOT EXISTS (SELECT 1 FROM inventory_inspections WHERE item_id = ?1)))`

export async function updateItem(unit: UnitView, item: ItemCore, category: Category, input: ItemInput, actorId: string | null): Promise<void> {
  if (item.state === 'disposed') refuse('inventory.item.disposed', 'This item has been disposed of.')
  if (category.departmentId !== item.departmentId) refuse('inventory.item.other-department', 'An item moves only between categories of its own department.', { remedy: 'Its tag stays; dispose of it and add it again to move it to another department.' })
  const at = nowMs()
  unit.add({
    sql: `UPDATE inventory_items SET category_id = ?3, tracking = ?2, quantity = ?4, updated_at = ?5, ${DETAIL_SET}
           WHERE id = ?1 AND state != 'disposed' AND ${TRACKING_FREE}
             AND (?2 = 'individual' OR container_id IS NULL AND NOT EXISTS (SELECT 1 FROM inventory_items k WHERE k.container_id = ?1))
             AND EXISTS (SELECT 1 FROM inventory_locations l WHERE l.id = ?8 AND (l.state = 'active' OR l.id = inventory_items.home_location_id))
             AND EXISTS (SELECT 1 FROM inventory_categories c WHERE c.id = ?3 AND (c.state = 'active' OR c.id = inventory_items.category_id))`,
    params: [item.id, input.tracking, category.id, input.tracking === 'counted' ? input.quantity : 1, at, ...detailValues(input)],
  }).expect(1, { code: 'inventory.item.changed', reason: 'This item could not be changed: it has been lent or inspected, so its tracking is fixed, or its category or home is archived.', remedy: 'Reload it and try again.' })
  setTags(unit, [item.id], input.tagIds)
  const events: { kind: string, condition: string | null }[] = [{ kind: 'edited', condition: null }]
  if (category.id !== item.categoryId) events.push({ kind: 'recategorised', condition: null })
  if (input.condition !== item.condition) events.push({ kind: 'condition-changed', condition: input.condition })
  unit.add({
    sql: `INSERT INTO inventory_item_events (id, item_id, kind, condition, actor, at)
          SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.kind'), json_extract(value, '$.condition'), ?, ? FROM json_each(?)`,
    params: [item.id, actorId, at, JSON.stringify(events.map(e => ({ id: newId('kev'), ...e })))],
  })
  if (category.id !== item.categoryId && input.tracking === 'individual') await recategorise(unit, item.id, category.id)
  unit.audit({ action: 'update', record: ['inventory.item', item.id], detail: category.id === item.categoryId ? {} : { fromCategory: item.categoryId, toCategory: category.id } })
}

// I12: the new category's kinds apply; the old one's go if never inspected, else stay, not applying.
async function recategorise(unit: UnitView, itemId: string, categoryId: string): Promise<void> {
  const stale = `item_id = ?1 AND source = 'category' AND kind_id NOT IN (SELECT kind_id FROM inventory_category_inspections WHERE category_id = ?2)`
  unit.add({ sql: `DELETE FROM inventory_inspection_dues WHERE ${stale} AND last_inspection_id IS NULL`, params: [itemId, categoryId] })
  unit.add({ sql: `UPDATE inventory_inspection_dues SET applies = 0, next_due_on = NULL WHERE ${stale}`, params: [itemId, categoryId] })
  await addDues(unit, [itemId], categoryId, await operatingDayOf(nowMs()), true)
}
