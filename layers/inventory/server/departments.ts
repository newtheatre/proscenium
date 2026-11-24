// Kit departments and their categories (INV-05, INV-06). Every write is one statement whose
// predicate carries its own condition, so two administrators at once cannot leave it half done.
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { operatingDayOf } from '#modules/core'
import { STARTING_DEPARTMENTS, type Category, type Department } from '../shared/setup'
import type { CategoryInput, DepartmentInput } from './inputs'

type ListState = Department['state']

interface DepartmentRow { id: string, name: string, tag_prefix: string, next_tag_number: number, lends_to: Department['lendsTo'], guidance: string | null, contact: string | null, requirements: string | null, state: ListState, categories: number | null }
interface CategoryRow { id: string, department_id: string, name: string, requirements: string | null, kind_ids: string | null, state: ListState, items: number | null }

const toDepartment = (r: DepartmentRow): Department => ({
  id: r.id,
  name: r.name,
  tagPrefix: r.tag_prefix,
  nextTagNumber: r.next_tag_number,
  lendsTo: r.lends_to,
  guidance: r.guidance,
  contact: r.contact,
  requirements: JSON.parse(r.requirements ?? '[]'),
  state: r.state,
  categories: r.categories ?? 0,
})

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  departmentId: r.department_id,
  name: r.name,
  requirements: JSON.parse(r.requirements ?? '[]'),
  kindIds: JSON.parse(r.kind_ids ?? '[]'),
  state: r.state,
  items: r.items ?? 0,
})

const DEPARTMENT_SELECT = `SELECT d.*, (SELECT count(*) FROM inventory_categories c WHERE c.department_id = d.id AND c.state = 'active') AS categories
  FROM inventory_departments d`
const CATEGORY_SELECT = `SELECT c.*,
    (SELECT json_group_array(ci.kind_id) FROM inventory_category_inspections ci JOIN inventory_inspection_kinds k ON k.id = ci.kind_id
      WHERE ci.category_id = c.id AND k.state = 'active') AS kind_ids,
    (SELECT count(*) FROM inventory_items i WHERE i.category_id = c.id AND i.state != 'disposed') AS items
  FROM inventory_categories c`

export async function listDepartments(): Promise<Department[]> {
  return (await all<DepartmentRow>(`${DEPARTMENT_SELECT} ORDER BY d.state = 'archived', d.sort, lower(d.name)`)).map(toDepartment)
}

export async function departmentRow(id: string): Promise<Department> {
  const row = await first<DepartmentRow>(`${DEPARTMENT_SELECT} WHERE d.id = ?`, id)
  return row ? toDepartment(row) : refuse('inventory.department.not-found', 'There is no such kit department.', { status: 404 })
}

export async function listCategories(): Promise<Category[]> {
  return (await all<CategoryRow>(`${CATEGORY_SELECT} ORDER BY c.state = 'archived', c.sort, lower(c.name)`)).map(toCategory)
}

export async function categoryRow(id: string): Promise<Category> {
  const row = await first<CategoryRow>(`${CATEGORY_SELECT} WHERE c.id = ?`, id)
  return row ? toCategory(row) : refuse('inventory.category.not-found', 'There is no such category.', { status: 404 })
}

// ---- Departments ---------------------------------------------------------------------------------

const DEPARTMENT_TAKEN = {
  code: 'inventory.department.taken',
  reason: 'Another kit department already has that name or tag prefix, or items already carry tags with that prefix.',
  remedy: 'Choose another name or prefix.',
}

// I2 and I3: a prefix is one department's, and never one that other departments' tags already use.
const FREE_SQL = `NOT EXISTS (SELECT 1 FROM inventory_departments o WHERE o.id != ?1 AND ((o.state = 'active' AND lower(o.name) = lower(?2)) OR o.tag_prefix = ?3))
  AND NOT EXISTS (SELECT 1 FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id WHERE c.department_id != ?1 AND i.tag GLOB ?3 || '-*')`

export function addDepartment(unit: UnitView, input: DepartmentInput): string {
  const id = newId('kdp')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO inventory_departments (id, name, tag_prefix, lends_to, guidance, contact, requirements, sort, created_at, updated_at)
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT coalesce(max(sort), 0) + 1 FROM inventory_departments), ?8, ?8 WHERE ${FREE_SQL}`,
    params: [id, input.name, input.tagPrefix, input.lendsTo, input.guidance, input.contact, JSON.stringify(input.requirements), at],
  }).expect(1, DEPARTMENT_TAKEN)
  unit.audit({ action: 'create', record: ['inventory.department', id], detail: { tagPrefix: input.tagPrefix, lendsTo: input.lendsTo } })
  return id
}

// I3: a new prefix applies to tags made from now on; labels already printed stay true.
export function updateDepartment(unit: UnitView, department: Department, input: DepartmentInput): void {
  unit.add({
    sql: `UPDATE inventory_departments SET name = ?2, tag_prefix = ?3, lends_to = ?4, guidance = ?5, contact = ?6, requirements = ?7, updated_at = ?8
           WHERE id = ?1 AND ${FREE_SQL}`,
    params: [department.id, input.name, input.tagPrefix, input.lendsTo, input.guidance, input.contact, JSON.stringify(input.requirements), nowMs()],
  }).expect(1, DEPARTMENT_TAKEN)
  const detail: Record<string, string> = {}
  if (department.tagPrefix !== input.tagPrefix) Object.assign(detail, { fromPrefix: department.tagPrefix, toPrefix: input.tagPrefix })
  if (department.lendsTo !== input.lendsTo) Object.assign(detail, { fromLendsTo: department.lendsTo, toLendsTo: input.lendsTo })
  unit.audit({ action: 'update', record: ['inventory.department', department.id], detail })
}

// I8: a department with active categories is refused archiving, naming the count.
export function setDepartmentState(unit: UnitView, department: Department, to: ListState): void {
  if (to === 'archived' && department.categories > 0) {
    refuse('inventory.department.in-use', `This department still has ${department.categories} active ${department.categories === 1 ? 'category' : 'categories'}.`, {
      remedy: 'Archive its categories first.',
      detail: { categories: String(department.categories) },
    })
  }
  unit.add({
    sql: `UPDATE inventory_departments SET state = ?2, updated_at = ?3 WHERE id = ?1 AND state != ?2
             AND (?2 = 'active' OR NOT EXISTS (SELECT 1 FROM inventory_categories WHERE department_id = ?1 AND state = 'active'))
             AND (?2 = 'archived' OR NOT EXISTS (SELECT 1 FROM inventory_departments o WHERE o.id != ?1 AND o.state = 'active' AND lower(o.name) = lower(inventory_departments.name)))`,
    params: [department.id, to, nowMs()],
  }).expect(1, { code: 'inventory.department.changed', reason: 'This department changed just now, or another active department has its name.', remedy: 'Reload the list.' })
  unit.audit({ action: 'state', record: ['inventory.department', department.id], detail: { to } })
}

// The starting departments, only while there are none, so a second press makes nothing twice.
export function startDepartments(unit: UnitView): number {
  const at = nowMs()
  const rows = STARTING_DEPARTMENTS.map((d, i) => ({ id: newId('kdp'), ...d, sort: i + 1 }))
  unit.add({
    sql: `INSERT INTO inventory_departments (id, name, tag_prefix, lends_to, sort, created_at, updated_at)
          SELECT json_extract(value, '$.id'), json_extract(value, '$.name'), json_extract(value, '$.tagPrefix'), json_extract(value, '$.lendsTo'), json_extract(value, '$.sort'), ?, ?
            FROM json_each(?) WHERE NOT EXISTS (SELECT 1 FROM inventory_departments)`,
    params: [at, at, JSON.stringify(rows)],
  }).expect(rows.length, { code: 'inventory.departments.started', reason: 'Kit departments have been set up already.', remedy: 'Reload the list.' })
  unit.audit({ action: 'create', detail: { startingDepartments: rows.length } })
  return rows.length
}

// ---- Categories ----------------------------------------------------------------------------------

const CATEGORY_TAKEN = { code: 'inventory.category.taken', reason: 'This department already has a category with that name.', remedy: 'Choose another name.' }
const KIND_GONE = { code: 'inventory.kind.archived', reason: 'One of the inspection kinds chosen is archived or no longer exists.', remedy: 'Reload and choose again.' }

export async function addCategory(unit: UnitView, input: CategoryInput): Promise<string> {
  const department = await departmentRow(input.departmentId)
  if (department.state !== 'active') refuse('inventory.department.archived', 'This kit department is archived.', { remedy: 'Restore it first.' })
  const id = newId('kcat')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO inventory_categories (id, department_id, name, requirements, sort, created_at, updated_at)
          SELECT ?1, d.id, ?2, ?3, (SELECT coalesce(max(sort), 0) + 1 FROM inventory_categories WHERE department_id = d.id), ?4, ?4
            FROM inventory_departments d WHERE d.id = ?5 AND d.state = 'active'
             AND NOT EXISTS (SELECT 1 FROM inventory_categories WHERE department_id = d.id AND state = 'active' AND lower(name) = lower(?2))`,
    params: [id, input.name, JSON.stringify(input.requirements), at, input.departmentId],
  }).expect(1, CATEGORY_TAKEN)
  await addKinds(unit, id, input.kindIds)
  unit.audit({ action: 'create', record: ['inventory.category', id], detail: { kinds: String(input.kindIds.length) } })
  return id
}

// A category keeps its department: a grant on a department reaches its categories' items.
export async function updateCategory(unit: UnitView, category: Category, input: Omit<CategoryInput, 'departmentId'>): Promise<void> {
  unit.add({
    sql: `UPDATE inventory_categories SET name = ?2, requirements = ?3, updated_at = ?4
           WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM inventory_categories o WHERE o.id != ?1 AND o.department_id = inventory_categories.department_id AND o.state = 'active' AND lower(o.name) = lower(?2))`,
    params: [category.id, input.name, JSON.stringify(input.requirements), nowMs()],
  }).expect(1, CATEGORY_TAKEN)
  const removed = category.kindIds.filter(k => !input.kindIds.includes(k))
  const added = input.kindIds.filter(k => !category.kindIds.includes(k))
  if (removed.length) removeKinds(unit, category.id, removed)
  await addKinds(unit, category.id, added)
  unit.audit({ action: 'update', record: ['inventory.category', category.id], detail: { kindsAdded: String(added.length), kindsRemoved: String(removed.length) } })
}

// N1: a kind added to a category falls due today for every individual item in it, in the same unit.
async function addKinds(unit: UnitView, categoryId: string, kindIds: string[]): Promise<void> {
  if (!kindIds.length) return
  const kinds = JSON.stringify(kindIds)
  unit.add({
    sql: `INSERT INTO inventory_category_inspections (category_id, kind_id)
          SELECT ?, k.id FROM inventory_inspection_kinds k WHERE k.state = 'active' AND k.id IN (SELECT value FROM json_each(?))`,
    params: [categoryId, kinds],
  }).expect(kindIds.length, KIND_GONE)
  unit.add({
    sql: `INSERT INTO inventory_inspection_dues (item_id, kind_id, source, applies, next_due_on)
          SELECT i.id, k.value, 'category', 1, ? FROM inventory_items i, json_each(?) k
           WHERE i.category_id = ? AND i.tracking = 'individual' AND i.state != 'disposed'
          ON CONFLICT (item_id, kind_id) DO UPDATE SET applies = 1, next_due_on = excluded.next_due_on
           WHERE inventory_inspection_dues.source = 'category' AND inventory_inspection_dues.applies = 0`,
    params: [await operatingDayOf(nowMs()), kinds, categoryId],
  })
}

// N1 and I12: a kind taken off a category goes from its items, kept as not applying where it was ever recorded.
function removeKinds(unit: UnitView, categoryId: string, kindIds: string[]): void {
  const kinds = JSON.stringify(kindIds)
  const scope = 'source = \'category\' AND kind_id IN (SELECT value FROM json_each(?)) AND item_id IN (SELECT id FROM inventory_items WHERE category_id = ?)'
  unit.add({ sql: 'DELETE FROM inventory_category_inspections WHERE category_id = ? AND kind_id IN (SELECT value FROM json_each(?))', params: [categoryId, kinds] })
  unit.add({ sql: `DELETE FROM inventory_inspection_dues WHERE ${scope} AND last_inspection_id IS NULL`, params: [kinds, categoryId] })
  unit.add({ sql: `UPDATE inventory_inspection_dues SET applies = 0, next_due_on = NULL WHERE ${scope} AND last_inspection_id IS NOT NULL`, params: [kinds, categoryId] })
}

// I8: a category with items not yet disposed of is refused archiving, naming the count.
export function setCategoryState(unit: UnitView, category: Category, to: ListState): void {
  if (to === 'archived' && category.items > 0) {
    refuse('inventory.category.in-use', `This category still has ${category.items} ${category.items === 1 ? 'item' : 'items'}.`, {
      remedy: 'Move its items to another category, or dispose of them, first.',
      detail: { items: String(category.items) },
    })
  }
  unit.add({
    sql: `UPDATE inventory_categories SET state = ?2, updated_at = ?3 WHERE id = ?1 AND state != ?2
             AND (?2 = 'active' OR NOT EXISTS (SELECT 1 FROM inventory_items WHERE category_id = ?1 AND state != 'disposed'))
             AND (?2 = 'archived' OR (
               EXISTS (SELECT 1 FROM inventory_departments d WHERE d.id = inventory_categories.department_id AND d.state = 'active')
               AND NOT EXISTS (SELECT 1 FROM inventory_categories o WHERE o.id != ?1 AND o.department_id = inventory_categories.department_id AND o.state = 'active' AND lower(o.name) = lower(inventory_categories.name))))`,
    params: [category.id, to, nowMs()],
  }).expect(1, { code: 'inventory.category.changed', reason: 'This category changed just now, its department is archived, or another active category has its name.', remedy: 'Reload the list.' })
  unit.audit({ action: 'state', record: ['inventory.category', category.id], detail: { to } })
}
