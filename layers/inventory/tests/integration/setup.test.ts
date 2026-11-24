// Setting up Inventory (INV-05 to INV-09): departments from the starting list and by hand, categories
// with their inspection kinds (N1), the locations tree, inspection kinds (N10) and archiving (I8).
// Runs first in its file: the starting lists are offered only while there are none.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { call, person, rows, server } from '../../../../tests/integration/helpers'
import createVenue from '../../../core/server/api/core/venues/index.post'
import listDepartments from '../../server/api/inventory/departments/index.get'
import addDepartment from '../../server/api/inventory/departments/index.post'
import startDepartments from '../../server/api/inventory/departments/start.post'
import putDepartment from '../../server/api/inventory/departments/[id]/index.put'
import departmentState from '../../server/api/inventory/departments/[id]/state.post'
import addCategory from '../../server/api/inventory/categories/index.post'
import putCategory from '../../server/api/inventory/categories/[id]/index.put'
import categoryState from '../../server/api/inventory/categories/[id]/state.post'
import listLocations from '../../server/api/inventory/locations/index.get'
import addLocation from '../../server/api/inventory/locations/index.post'
import putLocation from '../../server/api/inventory/locations/[id]/index.put'
import locationState from '../../server/api/inventory/locations/[id]/state.post'
import listKinds from '../../server/api/inventory/inspection-kinds/index.get'
import addKind from '../../server/api/inventory/inspection-kinds/index.post'
import startKinds from '../../server/api/inventory/inspection-kinds/start.post'
import putKind from '../../server/api/inventory/inspection-kinds/[id]/index.put'
import kindState from '../../server/api/inventory/inspection-kinds/[id]/state.post'
import { ready } from './stage'

const app = server({
  'POST /api/core/venues': createVenue,
  'GET /api/inventory/departments': listDepartments,
  'POST /api/inventory/departments': addDepartment,
  'POST /api/inventory/departments/start': startDepartments,
  'PUT /api/inventory/departments/:id': putDepartment,
  'POST /api/inventory/departments/:id/state': departmentState,
  'POST /api/inventory/categories': addCategory,
  'PUT /api/inventory/categories/:id': putCategory,
  'POST /api/inventory/categories/:id/state': categoryState,
  'GET /api/inventory/locations': listLocations,
  'POST /api/inventory/locations': addLocation,
  'PUT /api/inventory/locations/:id': putLocation,
  'POST /api/inventory/locations/:id/state': locationState,
  'GET /api/inventory/inspection-kinds': listKinds,
  'POST /api/inventory/inspection-kinds': addKind,
  'POST /api/inventory/inspection-kinds/start': startKinds,
  'PUT /api/inventory/inspection-kinds/:id': putKind,
  'POST /api/inventory/inspection-kinds/:id/state': kindState,
})

const manager = person(['inventory.setup.manage', 'core.venue.manage'])
async function req<T = any>(method: string, path: string, body?: unknown, actor = manager): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code
const ok = (r: { status: number, body: any }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}

const department = (fields: Record<string, unknown> = {}) => ({ name: 'Wardrobe', tagPrefix: 'wd', lendsTo: 'members', guidance: null, contact: null, ...fields })
const kind = (fields: Record<string, unknown> = {}) => ({ name: 'Rigging check', description: null, intervalDays: 30, certificate: 'none', contractorAllowed: false, blocksWhenOverdue: true, ...fields })
const location = (fields: Record<string, unknown> = {}) => ({ name: 'Store', parentId: null, venueId: null, spaceId: null, ...fields })

async function anItem(categoryId: string, locationId: string): Promise<string> {
  const id = newId('kit')
  await rows('INSERT INTO inventory_items (id, category_id, tag, name, tracking, home_location_id, currency, created_at, updated_at) VALUES (?, ?, ?, \'Lamp\', \'individual\', ?, \'GBP\', ?, ?)',
    id, categoryId, `X-${id.slice(-6)}`, locationId, Date.now(), Date.now())
  return id
}

beforeAll(ready)

describe('the setup step\'s starting lists (spec part 6)', () => {
  it('offers the four departments while there are none, makes them once, and refuses a second time', async () => {
    const before = ok(await req('GET', '/api/inventory/departments'))
    expect(before.starting.map((d: any) => `${d.name}:${d.tagPrefix}:${d.lendsTo}`)).toEqual(['Props:PRP:members', 'Costume:CST:members', 'Set:SET:productions', 'Technical:TEC:productions'])
    expect(ok(await req('POST', '/api/inventory/departments/start', {})).made).toBe(4)
    expect(code(await req('POST', '/api/inventory/departments/start', {}))).toBe('inventory.departments.started')
    const after = ok(await req('GET', '/api/inventory/departments'))
    expect(after.starting).toEqual([])
    expect(after.departments.map((d: any) => d.name)).toEqual(['Props', 'Costume', 'Set', 'Technical'])
  })

  it('offers the four inspection kinds while there are none, and makes them once', async () => {
    expect(ok(await req('GET', '/api/inventory/inspection-kinds')).starting).toHaveLength(4)
    expect(ok(await req('POST', '/api/inventory/inspection-kinds/start', {})).made).toBe(4)
    expect(code(await req('POST', '/api/inventory/inspection-kinds/start', {}))).toBe('inventory.kinds.started')
    const kinds = ok(await req('GET', '/api/inventory/inspection-kinds')).kinds
    expect(kinds.find((k: any) => k.name === 'Lifting equipment examination')).toMatchObject({ intervalDays: 182, certificate: 'required', contractorAllowed: true, blocksWhenOverdue: true })
  })
})

describe('departments (INV-05, I2, I3, L3)', () => {
  it('adds a department with its prefix in capitals, and refuses a second with the same name or prefix', async () => {
    const id = ok(await req('POST', '/api/inventory/departments', department())).departmentId
    expect((await rows<{ tag_prefix: string, next_tag_number: number }>('SELECT tag_prefix, next_tag_number FROM inventory_departments WHERE id = ?', id))[0]).toEqual({ tag_prefix: 'WD', next_tag_number: 1 })
    expect(code(await req('POST', '/api/inventory/departments', department({ tagPrefix: 'WX' })))).toBe('inventory.department.taken')
    expect(code(await req('POST', '/api/inventory/departments', department({ name: 'Other', tagPrefix: 'WD' })))).toBe('inventory.department.taken')
    expect((await req('POST', '/api/inventory/departments', department({ tagPrefix: 'W1' }))).status).toBe(422)
  })

  it('changes who a department lends to and its prefix, keeping the counter (I3)', async () => {
    const id = ok(await req('POST', '/api/inventory/departments', department({ name: 'Armoury', tagPrefix: 'ARM' }))).departmentId
    await rows('UPDATE inventory_departments SET next_tag_number = 12 WHERE id = ?', id)
    ok(await req('PUT', `/api/inventory/departments/${id}`, department({ name: 'Armoury', tagPrefix: 'AR', lendsTo: 'productions' })))
    expect((await rows('SELECT tag_prefix, lends_to, next_tag_number FROM inventory_departments WHERE id = ?', id))[0]).toEqual({ tag_prefix: 'AR', lends_to: 'productions', next_tag_number: 12 })
  })

  it('refuses a prefix another department\'s items already carry (I2)', async () => {
    const first = ok(await req('POST', '/api/inventory/departments', department({ name: 'Lighting', tagPrefix: 'LX' }))).departmentId
    const category = ok(await req('POST', '/api/inventory/categories', { departmentId: first, name: 'Lanterns', kindIds: [] })).categoryId
    const store = ok(await req('POST', '/api/inventory/locations', location({ name: 'Lighting store' }))).locationId
    await rows('INSERT INTO inventory_items (id, category_id, tag, name, tracking, home_location_id, currency, created_at, updated_at) VALUES (?, ?, \'LX-0001\', \'Fresnel\', \'individual\', ?, \'GBP\', ?, ?)', newId('kit'), category, store, Date.now(), Date.now())
    ok(await req('PUT', `/api/inventory/departments/${first}`, department({ name: 'Lighting', tagPrefix: 'LT' })))
    expect(code(await req('POST', '/api/inventory/departments', department({ name: 'Sound', tagPrefix: 'LX' })))).toBe('inventory.department.taken')
    ok(await req('PUT', `/api/inventory/departments/${first}`, department({ name: 'Lighting', tagPrefix: 'LX' })))
  })

  it('refuses archiving a department with active categories, naming the count, and archives it once they are gone (I8)', async () => {
    const id = ok(await req('POST', '/api/inventory/departments', department({ name: 'Puppets', tagPrefix: 'PUP' }))).departmentId
    const category = ok(await req('POST', '/api/inventory/categories', { departmentId: id, name: 'Marionettes', kindIds: [] })).categoryId
    const refused = await req('POST', `/api/inventory/departments/${id}/state`, { to: 'archived' })
    expect(code(refused)).toBe('inventory.department.in-use')
    expect(JSON.stringify(refused.body)).toContain('1 active category')
    ok(await req('POST', `/api/inventory/categories/${category}/state`, { to: 'archived' }))
    ok(await req('POST', `/api/inventory/departments/${id}/state`, { to: 'archived' }))
    expect(code(await req('POST', '/api/inventory/categories', { departmentId: id, name: 'Glove puppets', kindIds: [] }))).toBe('inventory.department.archived')
    expect(code(await req('POST', `/api/inventory/categories/${category}/state`, { to: 'active' }))).toBe('inventory.category.changed')
    ok(await req('POST', `/api/inventory/departments/${id}/state`, { to: 'active' }))
    ok(await req('POST', `/api/inventory/categories/${category}/state`, { to: 'active' }))
  })

  it('is set up only by a holder of inventory.setup.manage', async () => {
    expect((await req('GET', '/api/inventory/departments', undefined, person([]))).status).toBe(403)
    expect((await req('POST', '/api/inventory/departments', department({ name: 'Nope', tagPrefix: 'NOPE' }), person(['inventory.settings.manage']))).status).toBe(403)
  })
})

describe('categories and their inspection kinds (INV-06, N1)', () => {
  it('refuses a second category of the same name in one department, but allows it in another', async () => {
    const [props, costume] = ok(await req('GET', '/api/inventory/departments')).departments
    ok(await req('POST', '/api/inventory/categories', { departmentId: props.id, name: 'Hats', kindIds: [] }))
    expect(code(await req('POST', '/api/inventory/categories', { departmentId: props.id, name: 'hats', kindIds: [] }))).toBe('inventory.category.taken')
    ok(await req('POST', '/api/inventory/categories', { departmentId: costume.id, name: 'Hats', kindIds: [] }))
  })

  it('adds a kind\'s due to every individual item when the kind is put on its category, and takes it off again', async () => {
    const { departments } = ok(await req('GET', '/api/inventory/departments'))
    const technical = departments.find((d: any) => d.name === 'Technical')
    const pat = ok(await req('GET', '/api/inventory/inspection-kinds')).kinds.find((k: any) => k.name === 'PAT test')
    const category = ok(await req('POST', '/api/inventory/categories', { departmentId: technical.id, name: 'Cables', kindIds: [] })).categoryId
    const store = ok(await req('POST', '/api/inventory/locations', location({ name: 'Cable store' }))).locationId
    const lamp = await anItem(category, store)
    ok(await req('PUT', `/api/inventory/categories/${category}`, { name: 'Cables', kindIds: [pat.id] }))
    expect(await rows('SELECT kind_id, source, applies, next_due_on FROM inventory_inspection_dues WHERE item_id = ?', lamp)).toEqual([{ kind_id: pat.id, source: 'category', applies: 1, next_due_on: '2026-11-24' }])
    ok(await req('PUT', `/api/inventory/categories/${category}`, { name: 'Cables', kindIds: [] }))
    expect(await rows('SELECT 1 FROM inventory_inspection_dues WHERE item_id = ?', lamp)).toEqual([])
    expect(await rows('SELECT 1 FROM inventory_category_inspections WHERE category_id = ?', category)).toEqual([])
  })

  it('refuses an archived inspection kind on a category', async () => {
    const props = ok(await req('GET', '/api/inventory/departments')).departments[0]
    const kindId = ok(await req('POST', '/api/inventory/inspection-kinds', kind({ name: 'Retired check' }))).kindId
    ok(await req('POST', `/api/inventory/inspection-kinds/${kindId}/state`, { to: 'archived' }))
    expect(code(await req('POST', '/api/inventory/categories', { departmentId: props.id, name: 'Wigs', kindIds: [kindId] }))).toBe('inventory.kind.archived')
  })

  it('refuses archiving a category with items, naming the count (I8)', async () => {
    const props = ok(await req('GET', '/api/inventory/departments')).departments[0]
    const category = ok(await req('POST', '/api/inventory/categories', { departmentId: props.id, name: 'Swords', kindIds: [] })).categoryId
    const store = ok(await req('POST', '/api/inventory/locations', location({ name: 'Armoury' }))).locationId
    await anItem(category, store)
    await anItem(category, store)
    const refused = await req('POST', `/api/inventory/categories/${category}/state`, { to: 'archived' })
    expect(code(refused)).toBe('inventory.category.in-use')
    expect(JSON.stringify(refused.body)).toContain('2 items')
  })
})

describe('inspection kinds (INV-08, N10)', () => {
  it('moves the next due date of every passed item when the interval changes, from its last pass', async () => {
    const props = ok(await req('GET', '/api/inventory/departments')).departments[0]
    const kindId = ok(await req('POST', '/api/inventory/inspection-kinds', kind({ name: 'Harness check', intervalDays: 30 }))).kindId
    const category = ok(await req('POST', '/api/inventory/categories', { departmentId: props.id, name: 'Harnesses', kindIds: [kindId] })).categoryId
    const store = ok(await req('POST', '/api/inventory/locations', location({ name: 'Flying store' }))).locationId
    const passed = await anItem(category, store)
    const never = await anItem(category, store)
    const inspection = newId('kin')
    await rows('INSERT INTO inventory_inspection_dues (item_id, kind_id, source, applies, next_due_on) VALUES (?, ?, \'category\', 1, \'2026-11-24\'), (?, ?, \'category\', 1, \'2026-11-24\')', passed, kindId, never, kindId)
    await rows('INSERT INTO inventory_inspections (id, item_id, kind_id, done_on, result, next_due_on, recorded_by, created_at) VALUES (?, ?, ?, \'2026-11-01\', \'pass\', \'2026-12-01\', ?, ?)', inspection, passed, kindId, newId('acc'), Date.now())
    await rows('UPDATE inventory_inspection_dues SET last_inspection_id = ?, next_due_on = \'2026-12-01\' WHERE item_id = ?', inspection, passed)
    ok(await req('PUT', `/api/inventory/inspection-kinds/${kindId}`, kind({ name: 'Harness check', intervalDays: 60 })))
    expect(await rows('SELECT item_id, next_due_on FROM inventory_inspection_dues WHERE kind_id = ? ORDER BY next_due_on', kindId)).toEqual([
      { item_id: never, next_due_on: '2026-11-24' },
      { item_id: passed, next_due_on: '2026-12-31' },
    ])
    expect(await rows('SELECT next_due_on FROM inventory_inspections WHERE id = ?', inspection)).toEqual([{ next_due_on: '2026-12-01' }])
  })

  it('refuses a second kind of the same name', async () => {
    expect(code(await req('POST', '/api/inventory/inspection-kinds', kind({ name: 'pat test' })))).toBe('inventory.kind.taken')
  })
})

describe('the locations tree (INV-07, I5, I8)', () => {
  it('nests at most four deep, in a venue and one of its spaces', async () => {
    const place = (await call(app, 'POST', '/api/core/venues', { actor: manager, body: { name: 'Studio' }, headers: { 'idempotency-key': newId('req') } }))
    const { venueId, spaceId } = await place.json() as { venueId: string, spaceId: string }
    const store = ok(await req('POST', '/api/inventory/locations', location({ name: 'Costume store', venueId, spaceId }))).locationId
    const rail = ok(await req('POST', '/api/inventory/locations', location({ name: 'Rail 3', parentId: store }))).locationId
    const shelf = ok(await req('POST', '/api/inventory/locations', location({ name: 'Top', parentId: rail }))).locationId
    const box = ok(await req('POST', '/api/inventory/locations', location({ name: 'Box', parentId: shelf }))).locationId
    expect(code(await req('POST', '/api/inventory/locations', location({ name: 'Bag', parentId: box })))).toBe('inventory.location.too-deep')
    expect(code(await req('POST', '/api/inventory/locations', location({ name: 'Rail 3', parentId: store })))).toBe('inventory.location.taken')
    expect(code(await req('POST', '/api/inventory/locations', location({ name: 'Loose', spaceId })))).toBe('inventory.location.space-without-venue')
    const listed = ok(await req('GET', '/api/inventory/locations'))
    expect(listed.venues.find((v: any) => v.id === venueId).spaces.map((s: any) => s.id)).toContain(spaceId)
  })

  it('refuses moving a location inside itself, or so deep that what is inside it passes four levels', async () => {
    const a = ok(await req('POST', '/api/inventory/locations', location({ name: 'Workshop' }))).locationId
    const b = ok(await req('POST', '/api/inventory/locations', location({ name: 'Bay', parentId: a }))).locationId
    const c = ok(await req('POST', '/api/inventory/locations', location({ name: 'Rack', parentId: b }))).locationId
    expect(code(await req('PUT', `/api/inventory/locations/${a}`, location({ name: 'Workshop', parentId: c })))).toBe('inventory.location.inside-itself')
    const top = ok(await req('POST', '/api/inventory/locations', location({ name: 'Basement' }))).locationId
    const under = ok(await req('POST', '/api/inventory/locations', location({ name: 'Cage', parentId: top }))).locationId
    expect(code(await req('PUT', `/api/inventory/locations/${a}`, location({ name: 'Workshop', parentId: under })))).toBe('inventory.location.too-deep')
    ok(await req('PUT', `/api/inventory/locations/${a}`, location({ name: 'Workshop', parentId: top })))
    expect(await rows('SELECT parent_id FROM inventory_locations WHERE id = ?', a)).toEqual([{ parent_id: top }])
  })

  it('refuses archiving a location that holds items or other places, naming the count (I8)', async () => {
    const props = ok(await req('GET', '/api/inventory/departments')).departments[0]
    const category = ok(await req('POST', '/api/inventory/categories', { departmentId: props.id, name: 'Cups', kindIds: [] })).categoryId
    const store = ok(await req('POST', '/api/inventory/locations', location({ name: 'Prop store' }))).locationId
    const shelf = ok(await req('POST', '/api/inventory/locations', location({ name: 'Shelf A', parentId: store }))).locationId
    await anItem(category, shelf)
    expect(code(await req('POST', `/api/inventory/locations/${store}/state`, { to: 'archived' }))).toBe('inventory.location.has-places')
    const refused = await req('POST', `/api/inventory/locations/${shelf}/state`, { to: 'archived' })
    expect(code(refused)).toBe('inventory.location.in-use')
    expect(JSON.stringify(refused.body)).toContain('1 item is')
  })
})
