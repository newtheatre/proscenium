// The catalogue (INV-10, INV-11, INV-13 to INV-16): adding items with their tags (I1, I2), several
// alike and counted, their dues (N1, N4), tags, changing category (I12), tracking fixed once used
// (I4), moving with containers (I5, I6), and who may see which department's kit.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId } from '#kit'
import { addTerm } from '../../../core/server/vocabularies/service'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import addItems from '../../server/api/inventory/categories/[id]/items.post'
import listItems from '../../server/api/inventory/items/index.get'
import options from '../../server/api/inventory/items/options.get'
import readItem from '../../server/api/inventory/items/[id]/index.get'
import putItem from '../../server/api/inventory/items/[id]/index.put'
import moveItems from '../../server/api/inventory/items/move.post'
import byTag from '../../server/api/inventory/items/by-tag/[tag].get'
import { approveLoan } from '../../server/loans'
import { attempt, member, ready, request, shelf, type Shelf } from './stage'

const app = server({
  'POST /api/inventory/categories/:id/items': addItems,
  'GET /api/inventory/items': listItems,
  'GET /api/inventory/items/options': options,
  'GET /api/inventory/items/:id': readItem,
  'PUT /api/inventory/items/:id': putItem,
  'POST /api/inventory/items/move': moveItems,
  'GET /api/inventory/items/by-tag/:tag': byTag,
})

const lead = person(['inventory.item.edit'])
async function req<T = any>(method: string, path: string, body?: unknown, actor = lead): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const ok = (r: { status: number, body: any }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
const details = (s: Shelf, fields: Record<string, unknown> = {}) => ({
  name: 'Fresnel', description: null, homeLocationId: s.locationId, condition: 'good', lendable: true, make: null, model: null, serialNumber: null,
  acquiredOn: null, replacementValue: null, ownership: 'owned', ownerName: null, ownerDueBackOn: null, tagIds: [], requirements: [], ...fields,
})
const add = async (s: Shelf, fields: Record<string, unknown> = {}) => ok(await req('POST', `/api/inventory/categories/${s.categoryId}/items`, { ...details(s), tracking: 'individual', ...fields })).itemIds as string[]
const tags = async (ids: string[]) => (await rows<{ tag: string }>('SELECT tag FROM inventory_items WHERE id IN (SELECT value FROM json_each(?)) ORDER BY tag', JSON.stringify(ids))).map(r => r.tag)
const prefixOf = async (s: Shelf) => (await rows<{ tag_prefix: string }>('SELECT tag_prefix FROM inventory_departments WHERE id = ?', s.departmentId))[0]!.tag_prefix
const kind = async (categoryId: string, intervalDays = 30) => {
  const id = newId('kik')
  await rows('INSERT INTO inventory_inspection_kinds (id, name, interval_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, `Check ${id}`, intervalDays, Date.now(), Date.now())
  await rows('INSERT INTO inventory_category_inspections (category_id, kind_id) VALUES (?, ?)', categoryId, id)
  return id
}

beforeAll(ready)

describe('adding items (INV-10, INV-11, I1, I2)', () => {
  it('gives each item its tag from the department counter at once, and several alike consecutive tags', async () => {
    const s = await shelf()
    const prefix = await prefixOf(s)
    const [one] = await add(s)
    const run = await add(s, { count: 3 })
    expect(await tags([one!])).toEqual([`${prefix}-0001`])
    expect(await tags(run)).toEqual([`${prefix}-0002`, `${prefix}-0003`, `${prefix}-0004`])
    expect(await rows('SELECT next_tag_number FROM inventory_departments WHERE id = ?', s.departmentId)).toEqual([{ next_tag_number: 5 }])
    expect(await rows('SELECT kind, to_location_id FROM inventory_item_events WHERE item_id = ?', one)).toEqual([{ kind: 'added', to_location_id: s.locationId }])
  })

  it('never gives two people adding at once the same tag', async () => {
    const s = await shelf()
    const made = await Promise.all([add(s, { count: 2 }), add(s, { count: 2 }), add(s)])
    const all = await tags(made.flat())
    expect(new Set(all).size).toBe(5)
  })

  it('adds a counted item as one row with its quantity', async () => {
    const s = await shelf()
    const [goblets] = await add(s, { name: 'Goblet', tracking: 'counted', quantity: 10 })
    expect(await rows('SELECT tracking, quantity FROM inventory_items WHERE id = ?', goblets)).toEqual([{ tracking: 'counted', quantity: 10 }])
  })

  it('refuses an archived category, a hired-in item with no owner, and a counted item in a container', async () => {
    const s = await shelf()
    const [box] = await add(s, { name: 'Box' })
    expect(code(await req('POST', `/api/inventory/categories/${s.categoryId}/items`, { ...details(s), tracking: 'counted', quantity: 3, containerId: box }))).toBe('inventory.item.counted-in-container')
    expect((await req('POST', `/api/inventory/categories/${s.categoryId}/items`, { ...details(s, { ownership: 'hired-in' }), tracking: 'individual' })).status).toBe(422)
    await rows('UPDATE inventory_categories SET state = \'archived\' WHERE id = ?', s.categoryId)
    expect(code(await req('POST', `/api/inventory/categories/${s.categoryId}/items`, { ...details(s), tracking: 'individual' }))).toBe('inventory.category.archived')
  })

  it('makes a due for each inspection the category needs: today, or one interval on (N1, N4)', async () => {
    const s = await shelf()
    const kindId = await kind(s.categoryId, 30)
    const [today] = await add(s)
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'inventory.inspections.first-due', 'after-interval', { reason: 'test', confirm: true })
      await unit.commit()
    })
    const [later] = await add(s)
    const [counted] = await add(s, { tracking: 'counted', quantity: 4 })
    expect(await rows('SELECT item_id, next_due_on FROM inventory_inspection_dues WHERE kind_id = ? ORDER BY next_due_on', kindId)).toEqual([
      { item_id: today, next_due_on: '2026-11-24' },
      { item_id: later, next_due_on: '2026-12-24' },
    ])
    expect(await rows('SELECT 1 FROM inventory_inspection_dues WHERE item_id = ?', counted)).toEqual([])
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'inventory.inspections.first-due', 'on-adding', { reason: 'test', confirm: true })
      await unit.commit()
    })
  })

  it('tags an item with the theatre\'s kit tags, and refuses a word from another list', async () => {
    const s = await shelf()
    let victorian = ''
    await inContext(async () => {
      const unit = createUnit()
      victorian = await addTerm(unit.view(), 'inventory.tag', { label: 'Victorian' })
      await unit.commit()
    })
    const [dress] = await add(s, { name: 'Dress', tagIds: [victorian] })
    expect(await rows('SELECT term_id FROM inventory_item_tags WHERE item_id = ?', dress)).toEqual([{ term_id: victorian }])
    expect(code(await req('POST', `/api/inventory/categories/${s.categoryId}/items`, { ...details(s, { tagIds: [newId('trm')] }), tracking: 'individual' }))).toBe('inventory.item.tag-gone')
  })
})

describe('changing an item (I4, I12)', () => {
  it('brings the new category\'s inspections and keeps an inspected old one as not applying', async () => {
    const s = await shelf()
    const oldKind = await kind(s.categoryId)
    const newCategory = newId('kcat')
    await rows('INSERT INTO inventory_categories (id, department_id, name, created_at, updated_at) VALUES (?, ?, \'Other\', ?, ?)', newCategory, s.departmentId, Date.now(), Date.now())
    const newKind = await kind(newCategory)
    const [lamp] = await add(s)
    const inspection = newId('kin')
    await rows('INSERT INTO inventory_inspections (id, item_id, kind_id, done_on, result, next_due_on, recorded_by, created_at) VALUES (?, ?, ?, \'2026-11-20\', \'pass\', \'2026-12-20\', ?, ?)', inspection, lamp, oldKind, newId('acc'), Date.now())
    await rows('UPDATE inventory_inspection_dues SET last_inspection_id = ? WHERE item_id = ?', inspection, lamp)
    ok(await req('PUT', `/api/inventory/items/${lamp}`, { ...details(s), categoryId: newCategory, tracking: 'individual', quantity: 1 }))
    expect(await rows('SELECT kind_id, applies FROM inventory_inspection_dues WHERE item_id = ? ORDER BY applies', lamp)).toEqual([
      { kind_id: oldKind, applies: 0 },
      { kind_id: newKind, applies: 1 },
    ])
    expect((await rows<{ kind: string }>('SELECT kind FROM inventory_item_events WHERE item_id = ? ORDER BY kind', lamp)).map(r => r.kind)).toEqual(['added', 'edited', 'recategorised'])
  })

  it('refuses changing tracking once the item has been inspected, and refuses another department\'s category', async () => {
    const s = await shelf()
    const other = await shelf()
    const kindId = await kind(s.categoryId)
    const [lamp] = await add(s)
    await rows('INSERT INTO inventory_inspections (id, item_id, kind_id, done_on, result, recorded_by, created_at) VALUES (?, ?, ?, \'2026-11-20\', \'fail\', ?, ?)', newId('kin'), lamp, kindId, newId('acc'), Date.now())
    expect(code(await req('PUT', `/api/inventory/items/${lamp}`, { ...details(s), categoryId: s.categoryId, tracking: 'counted', quantity: 5 }))).toBe('inventory.item.changed')
    expect(code(await req('PUT', `/api/inventory/items/${lamp}`, { ...details(s), categoryId: other.categoryId, tracking: 'individual', quantity: 1 }))).toBe('inventory.item.other-department')
  })
})

describe('moving items (INV-14, I5, I6)', () => {
  it('moves a container with its contents, records where each is, and moving home clears it', async () => {
    const s = await shelf()
    const away = await shelf()
    const [hamper] = await add(s, { name: 'Hamper' })
    const [hat] = await add(s, { name: 'Hat', containerId: hamper })
    expect(ok(await req('POST', '/api/inventory/items/move', { itemIds: [hamper], locationId: away.locationId })).moved).toBe(2)
    expect(await rows('SELECT current_location_id FROM inventory_items WHERE id IN (?, ?)', hamper, hat)).toEqual([{ current_location_id: away.locationId }, { current_location_id: away.locationId }])
    expect(code(await req('POST', '/api/inventory/items/move', { itemIds: [hat], locationId: s.locationId }))).toBe('inventory.item.in-container')
    ok(await req('POST', '/api/inventory/items/move', { itemIds: [hamper], locationId: s.locationId }))
    expect(await rows('SELECT current_location_id FROM inventory_items WHERE id = ?', hat)).toEqual([{ current_location_id: null }])
    expect(await rows('SELECT count(*) AS n FROM inventory_item_events WHERE item_id = ? AND kind = \'moved\'', hat)).toEqual([{ n: 2 }])
  })

  it('refuses moving an item promised to a loan', async () => {
    const s = await shelf()
    const away = await shelf()
    const [lamp] = await add(s)
    const loan = await request(s, 1, 3, [{ itemId: lamp! }])
    expect(await attempt(unit => approveLoan(unit, loan.id, member()))).toBe('ok')
    const refused = await req('POST', '/api/inventory/items/move', { itemIds: [lamp], locationId: away.locationId })
    expect(code(refused)).toBe('inventory.item.on-loan')
  })
})

describe('who sees which kit (INV-13, INV-15, INV-16, I9)', () => {
  it('lists only the departments a person holds item.view on, finds by tag within them, and hides values from viewers', async () => {
    const mine = await shelf()
    const theirs = await shelf()
    const [own] = await add(mine, { replacementValue: 25000, serialNumber: 'SN-1' })
    const [other] = await add(theirs)
    const viewer = person([], { grants: [{ ability: 'inventory.item.view', via: 'role', record: { type: 'inventory.department', id: mine.departmentId } }] } as any)
    const list = ok(await req('GET', '/api/inventory/items', undefined, viewer))
    expect(list.items.map((i: any) => i.id)).toEqual([own])
    expect(list.editable).toEqual([])
    const tag = (await tags([own!]))[0]!
    expect(ok(await req('GET', `/api/inventory/items/by-tag/${tag.toLowerCase()}`, undefined, viewer)).itemId).toBe(own)
    expect((await req('GET', `/api/inventory/items/by-tag/${(await tags([other!]))[0]}`, undefined, viewer)).status).toBe(403)
    const seen = ok(await req('GET', `/api/inventory/items/${own}`, undefined, viewer))
    expect(seen.item.staff).toBeNull()
    expect(ok(await req('GET', `/api/inventory/items/${own}`)).item.staff).toMatchObject({ replacementValue: 25000, serialNumber: 'SN-1' })
    expect((await req('GET', `/api/inventory/items/${other}`, undefined, viewer)).status).toBe(403)
    expect((await req('GET', '/api/inventory/items', undefined, person([]))).status).toBe(403)
  })
})
