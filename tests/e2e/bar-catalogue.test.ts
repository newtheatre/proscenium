import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, finishSignIn, grantRole, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { poursRestrictedSwitchedOff } from '#shared/utils/bar'
import { chooseAction, click, fill, fillNumber, menuOptions, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-111 and F-114 through the real routes and the real screens. The database guards are pinned in
// the integration suites; this is what a bar manager can actually do with them.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
let member: TestMember
const barPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  member = await registerMember(app, 'ordinary', generatePassword())

  barManager = await registerMember(app, 'barmanager', barPassword)
  await grantRole(app, barManager, 'BAR_MANAGER', officer.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function trail<T>(action: string, target: string): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database
      .query('SELECT actor_id AS actorId, detail FROM audit_log WHERE action = ? AND target = ?')
      .get(action, target) as { actorId: string, detail: string } | null
    return row ? { actorId: row.actorId, detail: JSON.parse(row.detail) } as T : undefined
  }
  finally {
    database.close()
  }
}

function auditCount(action: string, target: string): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database
      .query('SELECT count(*) AS total FROM audit_log WHERE action = ? AND target = ?')
      .get(action, target) as { total: number }
    return row.total
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

const created = async (answered: Response): Promise<string> => {
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const addCategory = async (over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/categories', { name: named('Wine'), sort: 10, ...over }))

const addProduct = async (categoryId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/products', { name: named('House red'), categoryId, ...over }))

const addItem = async (over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/items', { name: named('Bottle'), unit: 'ML', containerMl: 750, ...over }))

// A product needs a serving size before it may go active (F-112 criterion 2).
const addVariant = async (productId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'bottle', label: 'Bottle', ...over }))

// And something for a sale to deplete, without which it may not go on the till (F-113).
async function addPouringVariant(productId: string): Promise<string> {
  const variantId = await addVariant(productId)
  const itemId = await addItem()
  expect((await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 175 }] })).status).toBe(200)
  return variantId
}

interface ListedProduct {
  id: string
  name: string
  status: string
  ageRestricted: boolean
  allergenState: string
  allergenNote: string | null
  everSold: boolean
  categoryName: string
}

interface ListedItem {
  id: string
  name: string
  unit: string
  onHand: number
  status: string
  hasMovements: boolean
}

interface ListedMovement {
  id: string
  itemId: string
  qty: number
  kind: string
  reason: string | null
  unitCostPence: number | null
  containerCostPence: number | null
  containerQty: number | null
  actorId: string | null
  reversed: boolean
}

// The whole list, not the first page: an absence assertion over one page passes for the wrong
// reason as soon as the suite has made more rows than a page holds.
async function listing<T>(path: string, query = '', as = officer.cookie): Promise<T[]> {
  const answered = await send('GET', `${path}?pageSize=100${query}`, undefined, as)
  expect(answered.status).toBe(200)
  return (await answered.json() as { items: T[] }).items
}

const products = (query = '', as = officer.cookie) => listing<ListedProduct>('/api/admin/bar/products', query, as)
const items = (query = '', as = officer.cookie) => listing<ListedItem>('/api/admin/bar/items', query, as)
const movements = (query = '', as = officer.cookie) => listing<ListedMovement>('/api/admin/bar/movements', query, as)

// A movement another screen writes, put straight in so a test can see how this one treats it.
function aMovement(itemId: string, kind: 'SALE' | 'COMP' | 'STOCKTAKE', qty: number): string {
  const database = new Database(app.databaseFile)
  try {
    const id = `mv-${crypto.randomUUID().slice(0, 12)}`
    const [refTable, refId] = kind === 'STOCKTAKE' ? ['stocktake_lines', `line-${id}`] : [null, null]
    database.query('INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, itemId, qty, kind, refTable, refId)
    return id
  }
  finally {
    database.close()
  }
}

const onHand = async (id: string): Promise<number> =>
  (await items()).find(item => item.id === id)?.onHand ?? Number.NaN

describe.skipIf(skip !== null)('a product carries what the till shows (F-111 criterion 1)', () => {
  test('name, category, allergens and the age flag all come back', async () => {
    const categoryId = await addCategory({ name: named('Reds') })
    const name = named('Merlot')
    const id = await addProduct(categoryId, {
      name,
      ageRestricted: true,
      allergenState: 'RECORDED',
      allergenNote: 'Sulphites',
    })

    expect((await products()).find(product => product.id === id)).toMatchObject({
      name,
      ageRestricted: true,
      allergenState: 'RECORDED',
      allergenNote: 'Sulphites',
      status: 'HIDDEN',
      everSold: false,
    })
  })

  test('confirmed no allergens is a different state from no information recorded', async () => {
    const categoryId = await addCategory()
    const confirmed = await addProduct(categoryId, { allergenState: 'NONE' })
    const unknown = await addProduct(categoryId)

    const listed = await products()
    expect(listed.find(product => product.id === confirmed)?.allergenState).toBe('NONE')
    expect(listed.find(product => product.id === unknown)?.allergenState).toBe('UNKNOWN')
  })

  test('recorded allergens without the note that records them are refused', async () => {
    const categoryId = await addCategory()
    const answered = await send('POST', '/api/admin/bar/products', {
      name: named('Nut'),
      categoryId,
      allergenState: 'RECORDED',
    })
    expect(answered.status).toBe(400)
  })

  test('the name is held once whatever the capitals, and the refusal names the holder', async () => {
    const categoryId = await addCategory()
    const name = named('Lager')
    await addProduct(categoryId, { name })

    const again = await send('POST', '/api/admin/bar/products', { name: name.toUpperCase(), categoryId })
    expect(again.status).toBe(409)
    expect((await again.json() as { message?: string }).message).toContain(name)
  })

  test('a list endpoint answers with an envelope, never a bare array', async () => {
    const answered = await send('GET', '/api/admin/bar/products?page=1&pageSize=2')
    expect(Object.keys(await answered.json() as Record<string, unknown>).sort())
      .toEqual(['items', 'page', 'pageSize', 'pages', 'total'])
  })
})

describe.skipIf(skip !== null)('a product is retired, never destroyed (F-111 criteria 2 and 3)', () => {
  test('a new product is hidden, and going on the till is its own decision', async () => {
    const categoryId = await addCategory()
    const id = await addProduct(categoryId)
    expect((await products()).find(product => product.id === id)?.status).toBe('HIDDEN')

    expect((await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'ACTIVE' })).status).toBe(409)
    await addPouringVariant(id)
    expect((await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'ACTIVE' })).status).toBe(200)
    expect((await products()).find(product => product.id === id)?.status).toBe('ACTIVE')
  })

  test('the same status twice is refused rather than silently accepted', async () => {
    const id = await addProduct(await addCategory())
    expect((await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'HIDDEN' })).status).toBe(409)
  })

  // The predicate rides the UPDATE and the audit reads its own changes(); the loser's write
  // touches nothing, so it is refused rather than told it succeeded (0049).
  test('two people activating the same product at once write one audit entry, and the loser is refused', async () => {
    const id = await addProduct(await addCategory())
    await addPouringVariant(id)

    const raced = await Promise.all([
      send('POST', `/api/admin/bar/products/${id}/status`, { status: 'ACTIVE' }),
      send('POST', `/api/admin/bar/products/${id}/status`, { status: 'ACTIVE' }, barManager.cookie),
    ])

    expect(raced.filter(answered => answered.status === 200).length).toBe(1)
    expect(raced.filter(answered => answered.status === 409).length).toBe(1)
    expect((await products()).find(product => product.id === id)?.status).toBe('ACTIVE')
    expect(auditCount('bar.product.status.changed', `bar-product:${id}`)).toBe(1)
  })

  test('a retired product leaves the list the till reads and stays in the console', async () => {
    const id = await addProduct(await addCategory())
    expect((await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'RETIRED' })).status).toBe(200)

    expect((await products('&retired=false')).map(product => product.id)).not.toContain(id)
    expect((await products()).find(product => product.id === id)?.status).toBe('RETIRED')
  })

  test('a product nothing has ever been sold as is deleted outright', async () => {
    const id = await addProduct(await addCategory())
    expect((await send('DELETE', `/api/admin/bar/products/${id}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/bar/products/${id}`)).status).toBe(404)
  })

  // Cascading deletes would otherwise reach the append-only variant_prices trigger and raise a
  // raw 500 (review-stock 1, 0010, 0047).
  test('a product with a priced variant is refused, readably, rather than reaching the trigger', async () => {
    const id = await addProduct(await addCategory())
    const variantId = await addVariant(id)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 350, effectiveFrom: today })

    const answered = await send('DELETE', `/api/admin/bar/products/${id}`)
    expect(answered.status).toBe(409)
    expect((await answered.json() as { message?: string }).message).toContain('retired')
  })

  test('a product in no category is refused, and a category with products stays', async () => {
    const categoryId = await addCategory()
    await addProduct(categoryId)
    expect((await send('POST', '/api/admin/bar/products', { name: named('Orphan'), categoryId: 'nowhere' })).status).toBe(404)
  })
})

// #908 item 4: a category with nothing against it can be deleted, rather than only ever renamed.
describe.skipIf(skip !== null)('a category with nothing against it can be deleted outright', () => {
  test('an empty category is deleted', async () => {
    const categoryId = await addCategory()
    expect((await send('DELETE', `/api/admin/bar/categories/${categoryId}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/bar/categories/${categoryId}`)).status).toBe(404)
  })

  test('a category with a product in it is refused, naming the count', async () => {
    const categoryId = await addCategory()
    await addProduct(categoryId)
    const answered = await send('DELETE', `/api/admin/bar/categories/${categoryId}`)
    expect(answered.status).toBe(409)
    expect((await answered.json() as { message?: string }).message).toContain('1 product')
  })

  test('a category with a price history is refused: prices are append-only, so it can only be renamed', async () => {
    const categoryId = await addCategory()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    await send('POST', `/api/admin/bar/categories/${categoryId}/prices`, { servingKind: 'single', pricePence: 100, effectiveFrom: today })
    const answered = await send('DELETE', `/api/admin/bar/categories/${categoryId}`)
    expect(answered.status).toBe(409)
    expect((await answered.json() as { message?: string }).message).toContain('price history')
  })
})

describe.skipIf(skip !== null)('the till layout is read, not deployed (F-111 criterion 4)', () => {
  test('changing the order changes the order the list comes back in', async () => {
    const first = await addCategory({ name: named('Aaa'), sort: 1 })
    const second = await addCategory({ name: named('Bbb'), sort: 2 })
    const productA = await addProduct(first, { name: named('In first') })
    const productB = await addProduct(second, { name: named('In second') })

    const order = async (): Promise<number[]> => {
      const listed = (await products()).map(product => product.id)
      return [listed.indexOf(productA), listed.indexOf(productB)]
    }

    const [beforeA, beforeB] = await order()
    expect(beforeA).toBeLessThan(beforeB!)

    // Only the order moves: the name is sent back unchanged, because the form takes the whole row.
    const listed = await listing<{ id: string, name: string }>('/api/admin/bar/categories')
    const name = listed.find(category => category.id === first)!.name
    expect((await send('PUT', `/api/admin/bar/categories/${first}`, { name, sort: 9 })).status).toBe(200)

    const [afterA, afterB] = await order()
    expect(afterA).toBeGreaterThan(afterB!)
  })
})

describe.skipIf(skip !== null)('every change is audited with a from and a to (F-111 criterion 5)', () => {
  test('creation names the actor and what was created', async () => {
    const categoryId = await addCategory()
    const name = named('Audited')
    const id = await addProduct(categoryId, { name })

    const entry = trail<{ actorId: string, detail: { name: string } }>('bar.product.created', `bar-product:${id}`)
    expect(entry?.actorId).toBe(officer.id)
    expect(entry?.detail).toMatchObject({ name })
  })

  test('an edit records the old and the new value of each field it moved', async () => {
    const categoryId = await addCategory()
    const id = await addProduct(categoryId, { name: named('Before'), ageRestricted: false })
    const after = named('After')
    expect((await send('PUT', `/api/admin/bar/products/${id}`, {
      name: after,
      categoryId,
      ageRestricted: true,
    })).status).toBe(200)

    const entry = trail<{ detail: { changes: { ageRestricted: { from: boolean, to: boolean } } } }>(
      'bar.product.updated',
      `bar-product:${id}`,
    )
    expect(entry?.detail.changes.ageRestricted).toEqual({ from: false, to: true })
  })

  test('the allergen note itself never reaches the trail, only that it moved', async () => {
    const categoryId = await addCategory()
    const name = named('Noted')
    const id = await addProduct(categoryId, { name })
    await send('PUT', `/api/admin/bar/products/${id}`, {
      name,
      categoryId,
      allergenState: 'RECORDED',
      allergenNote: 'Contains barley',
    })

    const entry = trail<{ detail: Record<string, unknown> }>('bar.product.updated', `bar-product:${id}`)
    expect(JSON.stringify(entry?.detail)).not.toContain('barley')
    expect(entry?.detail.allergenNoteChanged).toBe(true)
  })

  test('a status change records the state it moved between', async () => {
    const id = await addProduct(await addCategory())
    await addPouringVariant(id)
    await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'ACTIVE' })

    const entry = trail<{ detail: { changes: { status: { from: string, to: string } } } }>(
      'bar.product.status.changed',
      `bar-product:${id}`,
    )
    expect(entry?.detail.changes.status).toEqual({ from: 'HIDDEN', to: 'ACTIVE' })
  })
})

// Issue 1299 (F-106, F-111 criterion 6): a product pouring restricted stock sold with no Check ID,
// so the list names every one for the Bar Manager and an edit cannot leave one that way.
describe.skipIf(skip !== null)('a product pouring restricted stock asks for Check ID (issue 1299)', () => {
  async function aWinePouredUnrestricted(): Promise<{ productId: string, itemId: string, itemName: string, name: string, categoryId: string }> {
    const categoryId = await addCategory()
    const name = named('Review Merlot')
    const productId = await addProduct(categoryId, { name, ageRestricted: false })
    const itemName = named('Merlot 750ml')
    const itemId = await addItem({ name: itemName })
    const variantId = await addVariant(productId, { servingKind: '175ml', label: '175ml' })
    expect((await send('PUT', `/api/admin/bar/variants/${variantId}/components`, {
      components: [{ itemId, qty: 175 }],
    })).status).toBe(200)
    return { productId, itemId, itemName, name, categoryId }
  }

  test('the list names each product that pours restricted stock with Age restricted off, and what it pours', async () => {
    const wine = await aWinePouredUnrestricted()
    const listed = await listing<ListedProduct & { restrictedPours: string[] }>('/api/admin/bar/products', '&poursRestrictedSwitchedOff=true')
    expect(listed.find(product => product.id === wine.productId)?.restrictedPours).toEqual([wine.itemName])
    expect(listed.every(poursRestrictedSwitchedOff)).toBe(true)
  })

  test('an edit leaving it unrestricted is refused naming the stocked item; switching it on clears it', async () => {
    const wine = await aWinePouredUnrestricted()
    const refused = await send('PUT', `/api/admin/bar/products/${wine.productId}`, {
      name: wine.name,
      categoryId: wine.categoryId,
      ageRestricted: false,
    })
    expect(refused.status).toBe(409)
    expect((await refused.json() as { message?: string }).message).toContain(`${wine.itemName}, which is age restricted`)

    expect((await send('PUT', `/api/admin/bar/products/${wine.productId}`, {
      name: wine.name,
      categoryId: wine.categoryId,
      ageRestricted: true,
    })).status).toBe(200)
    const listed = await listing<ListedProduct>('/api/admin/bar/products', '&poursRestrictedSwitchedOff=true')
    expect(listed.some(product => product.id === wine.productId)).toBe(false)
  })

  test('a stocked item that is not alcohol switched off takes the product off the list', async () => {
    const wine = await aWinePouredUnrestricted()
    expect((await send('PUT', `/api/admin/bar/items/${wine.itemId}`, {
      name: wine.itemName,
      unit: 'ML',
      containerMl: 750,
      ageRestricted: false,
    })).status).toBe(200)
    const listed = await listing<ListedProduct>('/api/admin/bar/products', '&poursRestrictedSwitchedOff=true')
    expect(listed.some(product => product.id === wine.productId)).toBe(false)
  })
})

// Issue 1348 (F-107 criteria 1, 3 and 4): the answer is given once, on the stocked item, and every
// product reads its own from what it pours, with only what the bar adds kept on the product.
describe.skipIf(skip !== null)('allergens are answered once, on the stocked item (issue 1348)', () => {
  interface ListedAnswer { id: string, allergenState: string, allergenNotes: string | null }

  test('an item takes an answer, recorded needs its note, and the change is audited', async () => {
    const id = await addItem({ allergenState: 'NONE' })
    expect((await items()).find(item => item.id === id) as unknown as ListedAnswer).toMatchObject({ allergenState: 'NONE' })

    const name = named('Answered red')
    const refused = await send('PUT', `/api/admin/bar/items/${id}`, { name, unit: 'ML', containerMl: 750, allergenState: 'RECORDED' })
    expect(refused.status).toBe(400)
    expect((await send('PUT', `/api/admin/bar/items/${id}`, {
      name,
      unit: 'ML',
      containerMl: 750,
      allergenState: 'RECORDED',
      allergenNotes: 'Contains sulphites',
    })).status).toBe(200)
    const entry = trail<{ detail: { changes: { allergenState: { from: string, to: string } } } }>('bar.item.updated', `bar-item:${id}`)
    expect(entry?.detail.changes.allergenState).toEqual({ from: 'NONE', to: 'RECORDED' })
  })

  test('the register lists the unanswered first, and filters to them', async () => {
    const stem = named('Answer me')
    const unanswered = await addItem({ name: `${stem} one` })
    const answered = await addItem({ name: `${stem} two`, allergenState: 'NONE' })
    const search = `&search=${encodeURIComponent(stem)}`
    const listed = await listing<ListedAnswer>('/api/admin/bar/items', `${search}&allergenState=is:UNKNOWN`)
    expect(listed.map(item => item.id)).toEqual([unanswered])
    const sorted = await listing<ListedAnswer>('/api/admin/bar/items', `${search}&sort=allergens`)
    expect(sorted.map(item => item.id)).toEqual([unanswered, answered])
  })

  test('a product reads its answer from what it pours, with what the bar adds after', async () => {
    const categoryId = await addCategory()
    const wine = named('Poured white')
    const itemId = await addItem({ name: wine, allergenState: 'RECORDED', allergenNotes: 'Contains sulphites' })
    const productId = await addProduct(categoryId, { allergenState: 'RECORDED', allergenNote: 'Lemon twist' })
    const variantId = await addVariant(productId, { servingKind: '175ml', label: '175ml' })
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 175 }] })

    const product = (await products()).find(one => one.id === productId) as unknown as { allergens: { state: string, note: string } }
    expect(product.allergens).toEqual({ state: 'RECORDED', note: `${wine}: Contains sulphites. Added at the bar: Lemon twist.` })
  })
})

// The name predicate and the audit insert share one batch (auditedWrite, 0049), so a losing
// racer's write touches nothing and the audit trail never logs a change that did not happen.
describe.skipIf(skip !== null)('a race for a name is refused, and the loser logs nothing (0049)', () => {
  test('two managers creating a category with the same name at once write one audit entry', async () => {
    const name = named('Contested category')
    const raced = await Promise.all([
      send('POST', '/api/admin/bar/categories', { name, sort: 10 }),
      send('POST', '/api/admin/bar/categories', { name, sort: 20 }, barManager.cookie),
    ])

    expect(raced.filter(answered => answered.status === 200).length).toBe(1)
    expect(raced.filter(answered => answered.status === 409).length).toBe(1)
    const { id } = await raced.find(answered => answered.status === 200)!.json() as { id: string }
    expect(auditCount('bar.category.created', `bar-category:${id}`)).toBe(1)
  })

  // Skipped until #1576: both edits of one row apply; nothing on the predicate tells them apart.
  test.skip('two managers renaming the same category at once write one audit entry, and the loser is refused', async () => {
    const categoryId = await addCategory()
    const target = named('Renamed category')

    const raced = await Promise.all([
      send('PUT', `/api/admin/bar/categories/${categoryId}`, { name: target, sort: 10 }),
      send('PUT', `/api/admin/bar/categories/${categoryId}`, { name: target, sort: 20 }, barManager.cookie),
    ])

    expect(raced.filter(answered => answered.status === 200).length).toBe(1)
    expect(raced.filter(answered => answered.status === 409).length).toBe(1)
    expect(auditCount('bar.category.updated', `bar-category:${categoryId}`)).toBe(1)
  })

  // Skipped until #1576: both edits of one row apply; nothing on the predicate tells them apart.
  test.skip('two managers renaming the same product at once write one audit entry, and the loser is refused', async () => {
    const categoryId = await addCategory()
    const productId = await addProduct(categoryId)
    const target = named('Renamed product')

    const raced = await Promise.all([
      send('PUT', `/api/admin/bar/products/${productId}`, { name: target, categoryId }),
      send('PUT', `/api/admin/bar/products/${productId}`, { name: target, categoryId }, barManager.cookie),
    ])

    expect(raced.filter(answered => answered.status === 200).length).toBe(1)
    expect(raced.filter(answered => answered.status === 409).length).toBe(1)
    expect(auditCount('bar.product.updated', `bar-product:${productId}`)).toBe(1)
  })

  // Skipped until #1576: both edits of one row apply; nothing on the predicate tells them apart.
  test.skip('two managers renaming the same stocked item at once write one audit entry, and the loser is refused', async () => {
    const itemId = await addItem()
    const target = named('Renamed item')

    const raced = await Promise.all([
      send('PUT', `/api/admin/bar/items/${itemId}`, { name: target, unit: 'ML', containerMl: 750 }),
      send('PUT', `/api/admin/bar/items/${itemId}`, { name: target, unit: 'ML', containerMl: 750 }, barManager.cookie),
    ])

    expect(raced.filter(answered => answered.status === 200).length).toBe(1)
    expect(raced.filter(answered => answered.status === 409).length).toBe(1)
    expect(auditCount('bar.item.updated', `bar-item:${itemId}`)).toBe(1)
  })
})

// claimName (0047) subsumes the per-table named lookups: proved once per table it now covers.
describe.skipIf(skip !== null)('a name is held once whatever the capitals, and the refusal names the holder', () => {
  test('a category name collides case-insensitively', async () => {
    const name = named('Spirits')
    await addCategory({ name })
    const again = await send('POST', '/api/admin/bar/categories', { name: name.toUpperCase(), sort: 5 })
    expect(again.status).toBe(409)
    expect((await again.json() as { message?: string }).message).toContain(name)
  })

  test('a stocked item name collides case-insensitively', async () => {
    const name = named('Gin')
    await addItem({ name })
    const again = await send('POST', '/api/admin/bar/items', { name: name.toUpperCase(), unit: 'ML' })
    expect(again.status).toBe(409)
    expect((await again.json() as { message?: string }).message).toContain(name)
  })

  test('a product name collides case-insensitively', async () => {
    const categoryId = await addCategory()
    const name = named('Lager')
    await addProduct(categoryId, { name })
    const again = await send('POST', '/api/admin/bar/products', { name: name.toUpperCase(), categoryId })
    expect(again.status).toBe(409)
    expect((await again.json() as { message?: string }).message).toContain(name)
  })

  test('renaming onto a held product name refuses case-insensitively', async () => {
    const categoryId = await addCategory()
    const productId = await addProduct(categoryId)
    const name = named('Cider')
    await addProduct(categoryId, { name })

    const collided = await send('PUT', `/api/admin/bar/products/${productId}`, { name: name.toUpperCase(), categoryId })
    expect(collided.status).toBe(409)
    expect((await collided.json() as { message?: string }).message).toContain(name)
  })

  test('renaming onto a held category name refuses, and a 404 still wins when the row itself is gone', async () => {
    const categoryId = await addCategory()
    const name = named('Wine')
    await addCategory({ name })

    const collided = await send('PUT', `/api/admin/bar/categories/${categoryId}`, { name: name.toUpperCase(), sort: 1 })
    expect(collided.status).toBe(409)
    expect((await collided.json() as { message?: string }).message).toContain(name)

    await send('DELETE', `/api/admin/bar/categories/${categoryId}`)
    expect((await send('PUT', `/api/admin/bar/categories/${categoryId}`, { name: named('Gone'), sort: 1 })).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('a stocked item is counted in its own unit (F-114 criterion 1)', () => {
  test('an item carries a name and a real counting unit', async () => {
    const name = named('House red')
    const id = await addItem({ name })
    expect((await items()).find(item => item.id === id))
      .toMatchObject({ name, unit: 'ML', onHand: 0, status: 'ACTIVE', hasMovements: false })
  })

  test('an item with movements is retired, never deleted', async () => {
    const id = await addItem()
    expect((await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'DELIVERY',
      qty: 750,
      costPence: 480,
    })).status).toBe(200)

    expect((await send('DELETE', `/api/admin/bar/items/${id}`)).status).toBe(409)

    // Retiring needs the stock counted out first, or on-hand would vanish with it.
    expect((await send('POST', `/api/admin/bar/items/${id}/status`, { status: 'RETIRED' })).status).toBe(409)
    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'ADJUST', qty: -750, reason: 'COUNT_CORRECTION' })
    expect((await send('POST', `/api/admin/bar/items/${id}/status`, { status: 'RETIRED' })).status).toBe(200)
  })

  // The predicate rides the UPDATE and the audit reads its own changes(); the loser's write
  // touches nothing, so it is refused rather than told it succeeded (0049).
  test('two people retiring the same item at once write one audit entry, and the loser is refused', async () => {
    const id = await addItem()

    const raced = await Promise.all([
      send('POST', `/api/admin/bar/items/${id}/status`, { status: 'RETIRED' }),
      send('POST', `/api/admin/bar/items/${id}/status`, { status: 'RETIRED' }, barManager.cookie),
    ])

    expect(raced.filter(answered => answered.status === 200).length).toBe(1)
    expect(raced.filter(answered => answered.status === 409).length).toBe(1)
    expect((await items()).find(item => item.id === id)?.status).toBe('RETIRED')
    expect(auditCount('bar.item.status.changed', `bar-item:${id}`)).toBe(1)
  })

  test('the unit and container size are fixed once stock has moved', async () => {
    const name = named('Keg')
    const id = await addItem({ name, containerMl: 50_000 })
    expect((await send('PUT', `/api/admin/bar/items/${id}`, { name, unit: 'ML', containerMl: 30_000 })).status).toBe(200)

    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 30_000 })
    const refused = await send('PUT', `/api/admin/bar/items/${id}`, { name, unit: 'ML', containerMl: 50_000 })
    expect(refused.status).toBe(409)
    expect((await refused.json() as { message?: string }).message).toContain('retire it and add it again')
  })
})

describe.skipIf(skip !== null)('on hand is the sum of the movements (F-114 criteria 2 and 3)', () => {
  test('a delivery adds, wastage takes away, and the figure follows', async () => {
    const id = await addItem()
    expect(await onHand(id)).toBe(0)

    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 6000, costPence: 480 })
    expect(await onHand(id)).toBe(6000)

    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'WASTAGE', qty: -750, reason: 'BREAKAGE' })
    expect(await onHand(id)).toBe(5250)
  })

  test('wastage without a reason is refused, because waste has to be reportable', async () => {
    const id = await addItem()
    expect((await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'WASTAGE', qty: -750 })).status).toBe(400)
  })

  test('a reason outside the vocabulary is refused, so nothing free text lands in the register', async () => {
    const id = await addItem()
    const answered = await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'WASTAGE',
      qty: -750,
      reason: 'Dropped it by the cellar door',
    })
    expect(answered.status).toBe(400)
  })

  // A real reason from the vocabulary, on the wrong kind, is still refused (F-204); the message
  // itself is pinned at the schema in tests/unit/bar.test.ts.
  test('a reason from the vocabulary is refused when it does not pair with the kind', async () => {
    const id = await addItem()
    const answered = await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'ADJUST', qty: -750, reason: 'OUT_OF_DATE' })
    expect(answered.status).toBe(400)
  })

  test('a delivery records its cost, and nothing else may carry one', async () => {
    const id = await addItem({ unit: 'ITEM', containerMl: null })
    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 24, costPence: 95 })
    expect((await movements(`&itemId=${id}`))[0]).toMatchObject({ kind: 'DELIVERY', unitCostPence: 95, containerCostPence: null })

    const refused = await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'WASTAGE',
      qty: -1,
      reason: 'BREAKAGE',
      costPence: 95,
    })
    expect(refused.status).toBe(400)
  })

  // Decision 0100 (issue 1320): one cost is sent, what the delivery was bought at, and the route
  // keeps it the way the item is bought rather than as a rounded price a millilitre.
  test('a measured delivery keeps what its container cost, or the whole delivery where it has no size', async () => {
    const bottled = await addItem()
    expect((await send('POST', '/api/admin/bar/movements', { itemId: bottled, kind: 'DELIVERY', qty: 4500, costPence: 650 })).status).toBe(200)
    expect((await movements(`&itemId=${bottled}`))[0])
      .toMatchObject({ kind: 'DELIVERY', unitCostPence: null, containerCostPence: 650, containerQty: 750 })

    const kegged = await addItem({ containerMl: null })
    expect((await send('POST', '/api/admin/bar/movements', { itemId: kegged, kind: 'DELIVERY', qty: 50_000, costPence: 12_000 })).status).toBe(200)
    expect((await movements(`&itemId=${kegged}`))[0])
      .toMatchObject({ kind: 'DELIVERY', unitCostPence: null, containerCostPence: 12_000, containerQty: 50_000 })
  })

  // The kinds the till and the stocktake own cannot be hand-posted, or a sale would exist with no
  // money beside it.
  test('a sale depletion cannot be typed in by hand, and the refusal says who writes it', async () => {
    const id = await addItem()
    const refused = await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'SALE', qty: -175 })
    expect(refused.status).toBe(409)
    expect((await refused.json() as { message?: string }).message).toContain('F-105')

    for (const kind of ['STOCKTAKE', 'COMP', 'TRANSFER']) {
      expect((await send('POST', '/api/admin/bar/movements', { itemId: id, kind, qty: -1 })).status).toBe(409)
    }
  })

  test('a movement of nothing is refused', async () => {
    const id = await addItem()
    expect((await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'ADJUST', qty: 0, reason: 'OTHER' })).status).toBe(400)
  })

  // Stock is found as often as it is lost, so an adjustment has to go both ways.
  test('an adjustment can add as well as take away', async () => {
    const id = await addItem()
    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'ADJUST', qty: 400, reason: 'OPENING_BALANCE' })
    expect(await onHand(id)).toBe(400)

    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'ADJUST', qty: -150, reason: 'COUNT_CORRECTION' })
    expect(await onHand(id)).toBe(250)
  })

  test('a delivery with no cost entered records none rather than nought', async () => {
    const id = await addItem()
    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 750 })
    expect((await movements(`&itemId=${id}`))[0]?.unitCostPence).toBeNull()
  })
})

describe.skipIf(skip !== null)('a correction supersedes, and stamps who made it (F-114 criteria 4 and 5)', () => {
  test('a mistaken delivery is reversed, both rows stay, and the sum is right', async () => {
    const id = await addItem()
    const wrong = await created(await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'DELIVERY',
      qty: 7500,
      costPence: 480,
    }))
    expect(await onHand(id)).toBe(7500)

    expect((await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'REVERSAL',
      qty: -7500,
      reason: 'COUNT_CORRECTION',
      reversesId: wrong,
    })).status).toBe(200)

    expect(await onHand(id)).toBe(0)
    expect((await movements(`&itemId=${id}`)).length).toBe(2)
  })

  test('a reversal that does not cancel what it names is refused', async () => {
    const id = await addItem()
    const original = await created(await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 750 }))

    expect((await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'REVERSAL',
      qty: -700,
      reason: 'OTHER',
      reversesId: original,
    })).status).toBe(409)
  })

  test('a movement is reversed once, so a correction cannot hide behind a correction', async () => {
    const id = await addItem()
    const original = await created(await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 750 }))
    const reversal = { itemId: id, kind: 'REVERSAL', qty: -750, reason: 'OTHER', reversesId: original }

    expect((await send('POST', '/api/admin/bar/movements', reversal)).status).toBe(200)
    expect((await send('POST', '/api/admin/bar/movements', reversal)).status).toBe(409)
  })

  test('two people reversing the same movement at once write one reversal between them', async () => {
    const id = await addItem()
    const original = await created(await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 750 }))
    const reversal = { itemId: id, kind: 'REVERSAL', qty: -750, reason: 'OTHER', reversesId: original }

    const raced = await Promise.all([
      send('POST', '/api/admin/bar/movements', reversal),
      send('POST', '/api/admin/bar/movements', reversal, barManager.cookie),
    ])

    expect(raced.filter(answered => answered.status === 200).length).toBe(1)
    expect(await onHand(id)).toBe(0)
  })

  test('a reversal is not itself reversed, and the listing says which rows are spent', async () => {
    const id = await addItem()
    const original = await created(await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 750 }))
    const reversal = await created(await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'REVERSAL',
      qty: -750,
      reason: 'OTHER',
      reversesId: original,
    }))

    expect((await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'REVERSAL',
      qty: 750,
      reason: 'OTHER',
      reversesId: reversal,
    })).status).toBe(409)

    const listed = await movements(`&itemId=${id}`)
    expect(listed.find(movement => movement.id === original)?.reversed).toBe(true)
    expect(listed.find(movement => movement.id === reversal)?.reversed).toBe(false)
  })

  test('every movement stamps the person who made it', async () => {
    const id = await addItem()
    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 750 }, barManager.cookie)
    expect((await movements(`&itemId=${id}`))[0]?.actorId).toBe(barManager.id)
  })

  // Issue 1350 (F-114 criterion 4 as amended): a sale or a comp keeps its money in the ledger, so
  // putting its stock back by hand would leave the two disagreeing. A stocktake's row may go.
  test('a sale or a comp is never reversed by hand, and the refusal says how it is corrected', async () => {
    const id = await addItem()
    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 750 })
    for (const kind of ['SALE', 'COMP'] as const) {
      const poured = aMovement(id, kind, -25)
      const refused = await send('POST', '/api/admin/bar/movements', {
        itemId: id,
        kind: 'REVERSAL',
        qty: 25,
        reason: 'COUNT_CORRECTION',
        reversesId: poured,
      })
      expect(refused.status).toBe(409)
      expect((await refused.json() as { message?: string }).message).toContain('money')
    }
    expect(await onHand(id)).toBe(700)
  })

  test('a stocktake adjustment may still be reversed', async () => {
    const id = await addItem()
    const counted = aMovement(id, 'STOCKTAKE', 40)
    expect((await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'REVERSAL',
      qty: -40,
      reason: 'COUNT_CORRECTION',
      reversesId: counted,
    })).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('who may administer the bar (F-111 criterion 5)', () => {
  test('the bar manager may, and it is their screen', async () => {
    const categoryId = await created(await send('POST', '/api/admin/bar/categories', { name: named('Theirs') }, barManager.cookie))
    expect((await products('', barManager.cookie)).length).toBeGreaterThanOrEqual(0)
    expect((await send('POST', '/api/admin/bar/products', { name: named('Theirs'), categoryId }, barManager.cookie)).status).toBe(200)
  })

  test('an ordinary member reads nothing and writes nothing', async () => {
    expect((await send('GET', '/api/admin/bar/products', undefined, member.cookie)).status).toBe(403)
    expect((await send('GET', '/api/admin/bar/items', undefined, member.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/bar/categories', { name: named('Sneaked') }, member.cookie)).status).toBe(403)
  })

  test('a signed-out caller is refused', async () => {
    expect([401, 403]).toContain((await send('GET', '/api/admin/bar/products', undefined, '')).status)
  })
})

describe.skipIf(skip !== null)('a bar refusal held to a missing second factor names the way out (0040)', () => {
  function override(key: string, value: unknown): void {
    const database = new Database(app.databaseFile)
    try {
      database.query('INSERT OR REPLACE INTO config (key, value, updated_by, updated_at) VALUES (?, ?, NULL, ?)')
        .run(key, JSON.stringify(value), Math.floor(Date.now() / 1000))
    }
    finally {
      database.close()
    }
  }

  function clearOverride(key: string): void {
    const database = new Database(app.databaseFile)
    try {
      database.query('DELETE FROM config WHERE key = ?').run(key)
    }
    finally {
      database.close()
    }
  }

  test('the categories screen shows an enrolment link rather than a bare refusal', async () => {
    // Narrowed for one request rather than widened: this bar manager carries no authenticator,
    // matching a real committee member who has never needed one before.
    override('PRIVILEGED_ROLES', ['BAR_MANAGER'])
    try {
      const noFactor = await registerMember(app, 'barmanager-no-factor', barPassword)
      await request(app, 'POST', '/api/admin/roles', { userId: noFactor.id, role: 'BAR_MANAGER' }, officer.cookie)
      const view = await openSignedOutView(app.baseURL)
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', noFactor.email)
      await fill(view, 'form input[type="password"]', barPassword)
      await click(view, 'form button[type="submit"]')
      await finishSignIn(app, view, noFactor.email)

      // No marker to hydrate on a refused screen: the failure itself is what the next line waits for.
      await view.navigate(`${app.baseURL}/bar/categories`)
      await waitFor(view, `document.querySelector('[data-test="listing-failure"]')`)
      const shown = await textOf(view, '[data-test="listing-failure"]')
      expect(shown).toMatch(/authenticator/i)
      expect(shown).toContain('Set up an authenticator app')
      view.close()
    }
    finally {
      clearOverride('PRIVILEGED_ROLES')
    }
  }, 120_000)
})

describe.skipIf(skip !== null)('the screens', () => {
  test('the bar manager sees the products and the stock they are made of', async () => {
    const categoryId = await addCategory({ name: named('On screen') })
    const productName = named('On screen red')
    await addProduct(categoryId, { name: productName })

    const itemName = named('On screen bottle')
    const itemId = await addItem({ name: itemName, parQty: 5000 })
    await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty: 4500, costPence: 480 })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    // The console shell renders no <main>, so each screen names an element of its own.
    await visit(view, `${app.baseURL}/bar/products`, '[data-test="bar-products-table"]')
    expect(await textOf(view, '[data-test="bar-products-table"]')).toContain(productName)
    // #908 item 2: the retire-versus-delete copy reads as a sentence. It lives on the screen's
    // documentation page now, which the navbar's help opens (K-123, issue 1151 item 2).
    await visit(view, `${app.baseURL}/docs/bar/products`, '[data-test="docs-body"]')
    expect(await textOf(view, '[data-test="docs-body"]')).toContain('A product nothing has ever been sold as can be deleted outright.')

    await visit(view, `${app.baseURL}/bar/stock`, '[data-test="bar-items-table"]')
    const stock = await textOf(view, '[data-test="bar-items-table"]')
    expect(stock).toContain(itemName)
    expect(stock).toContain('4500 ml')
    // 4500 on hand against a par of 5000 (#907): the row reads Below par, as words plus colour.
    expect(await textOf(view, `[data-test="status-badge-${itemId}"]`)).toBe('Below par')

    await visit(view, `${app.baseURL}/bar/stock/movements`, '[data-test="bar-movements-table"]')
    const history = await textOf(view, '[data-test="bar-movements-table"]')
    expect(history).toContain('Delivery')
    expect(history).toContain('£4.80')
    view.close()
  }, 120_000)

  // A form validates its whole state, so a modal held to the wrong schema throws before the
  // handler runs and the button silently does nothing. Only driving it proves it works.
  test('a delivery recorded through its own button reaches the register and moves on hand', async () => {
    const itemName = named('Modal bottle')
    const itemId = await addItem({ name: itemName })
    await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty: 3000, costPence: 480 })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/bar/stock?search=${encodeURIComponent(itemName)}`, `[data-test="deliver-${itemId}"]`)
    await click(view, `[data-test="deliver-${itemId}"]`)
    await waitFor(view, `document.querySelector('[data-test="movement-form"]')`)

    await fillNumber(view, '[data-test="movement-qty"]', '250')
    await waitFor(view, `document.querySelector('[data-test="movement-submit"]')?.textContent.includes('Record a delivery of 250 ml')`)
    await click(view, '[data-test="movement-submit"]')
    await waitFor(view, `!document.querySelector('[data-test="movement-form"]')`)

    expect(await onHand(itemId)).toBe(3250)
    view.close()
  }, 120_000)

  // Issue 1350: a write-off starts as one, offers the measures the bar pours from the item and
  // the wastage reasons as chips, and says what it will write before it writes it.
  test('a write-off is two chips and one press on a phone, and says what it takes off', async () => {
    const categoryId = await addCategory()
    const itemName = named('Wasted red')
    const itemId = await addItem({ name: itemName })
    await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty: 750 })
    const productId = await addProduct(categoryId)
    const variantId = await addVariant(productId, { servingKind: '175ml', label: '175ml' })
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 175 }] })
    // A measure is offered only once a product on the till pours it (issue 1350).
    expect((await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })).status).toBe(200)

    const view = await openSignedOutView(app.baseURL, { width: 375, height: 812 })
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/bar/stock?search=${encodeURIComponent(itemName)}`, `[data-test="write-off-${itemId}"]`)
    await click(view, `[data-test="write-off-${itemId}"]`)
    await waitFor(view, `document.querySelector('[data-test="movement-form"]')`)
    await click(view, '[data-test="write-off-size-175"]')
    // With no reason chosen the press says why it did nothing, rather than doing nothing silently.
    await click(view, '[data-test="movement-submit"]')
    await waitFor(view, `document.querySelector('[data-test="movement-form"]')?.textContent.includes('That needs a reason')`)
    await click(view, '[data-test="write-off-reason-SPILLAGE"]')
    await waitFor(view, `document.querySelector('[data-test="movement-submit"]')?.textContent.includes('Write off 175 ml of ${itemName}')`)
    await click(view, '[data-test="movement-submit"]')
    await waitFor(view, `!document.querySelector('[data-test="movement-form"]')`)

    expect((await movements(`&itemId=${itemId}`))[0]).toMatchObject({ kind: 'WASTAGE', qty: -175, reason: 'SPILLAGE' })
    expect(await onHand(itemId)).toBe(575)
    view.close()
  }, 120_000)

  // Issue 1350: the history offers Reverse only where a reversal is allowed at all.
  test('the movement history offers no Reverse on a sale', async () => {
    const itemName = named('Sold bottle')
    const itemId = await addItem({ name: itemName })
    const delivered = await created(await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty: 750 }))
    const sold = aMovement(itemId, 'SALE', -175)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/bar/stock/movements?itemId=${itemId}`, `[data-test="reverse-${delivered}"]`)
    expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="reverse-${sold}"]'))`)).toBe(false)
    view.close()
  }, 120_000)

  // A ticket price is per container, not a per-ml sum nobody has ever priced by hand
  // (F-114 criterion 6), and it is kept as the container's cost rather than divided (0100).
  test('a measured item asks a delivery cost per container, and keeps it exactly', async () => {
    const itemName = named('Costed bottle')
    const itemId = await addItem({ name: itemName, containerMl: 700 })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/bar/stock?search=${encodeURIComponent(itemName)}`, `[data-test="deliver-${itemId}"]`)
    await click(view, `[data-test="deliver-${itemId}"]`)
    await waitFor(view, `document.querySelector('[data-test="movement-form"]')`)
    expect(await textOf(view, '[data-test="movement-form"]')).toContain('Cost of one container')

    await fillNumber(view, '[data-test="movement-qty"]', '4200')
    // £6.50 for 700 ml is 0.93p a ml, which a whole penny a ml kept as £7.00 a bottle (issue 1320).
    await fillNumber(view, '[data-test="movement-cost"]', '6.5')
    await click(view, '[data-test="movement-submit"]')
    await waitFor(view, `!document.querySelector('[data-test="movement-form"]')`)

    expect((await movements(`&itemId=${itemId}`))[0]).toMatchObject({
      kind: 'DELIVERY',
      qty: 4200,
      unitCostPence: null,
      containerCostPence: 650,
      containerQty: 700,
    })
    view.close()
  }, 120_000)

  test('an item counted by the each asks a delivery cost per unit, not per container', async () => {
    const itemName = named('Costed each')
    const itemId = await addItem({ name: itemName, unit: 'ITEM', containerMl: null })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/bar/stock?search=${encodeURIComponent(itemName)}`, `[data-test="deliver-${itemId}"]`)
    await click(view, `[data-test="deliver-${itemId}"]`)
    await waitFor(view, `document.querySelector('[data-test="movement-form"]')`)
    const form = await textOf(view, '[data-test="movement-form"]')
    expect(form).toContain('Cost of one')
    expect(form).not.toContain('Cost of one container')

    view.close()
  }, 120_000)

  // Issue 1348: the one review table works through the unanswered first, and saves in place.
  test('the allergens screen answers an item in place', async () => {
    const itemName = named('Aaa unanswered')
    const itemId = await addItem({ name: itemName })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/bar/stock/allergens`, `[data-test="allergen-row-${itemId}"]`)
    await click(view, `[data-test="allergen-${itemId}-NONE"]`)
    await click(view, `[data-test="allergen-save-${itemId}"]`)
    await waitFor(view, `!document.querySelector('[data-test="allergen-save-${itemId}"]')`)
    expect(((await items()).find(item => item.id === itemId) as unknown as { allergenState: string }).allergenState).toBe('NONE')
    view.close()
  }, 120_000)

  // Each action offers only the reasons the write path accepts for its kind (F-204, 3.5).
  test('a write-off offers wastage reasons and an adjustment its own', async () => {
    const itemName = named('Reason bottle')
    const itemId = await addItem({ name: itemName })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/bar/stock?search=${encodeURIComponent(itemName)}`, `[data-test="write-off-${itemId}"]`)
    await click(view, `[data-test="write-off-${itemId}"]`)
    await waitFor(view, `document.querySelector('[data-test="movement-form"]')`)
    const offered = await view.evaluate<string>(
      `JSON.stringify([...document.querySelectorAll('[data-test^="write-off-reason-"]')].map(chip => chip.innerText.trim()))`,
    )
    expect(JSON.parse(offered)).toEqual(['Breakage', 'Spillage', 'Out of date', 'Line cleaning', 'Quality', 'Training', 'Other'])
    await view.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await waitFor(view, `!document.querySelector('[data-test="movement-form"]')`)

    await chooseAction(view, `[data-test="more-${itemId}"]`, 'Adjust the count')
    await waitFor(view, `document.querySelector('[data-test="movement-reason"]')`)
    expect(await menuOptions(view, '[data-test="movement-reason"]')).toEqual([
      'Count correction', 'Opening balance', 'Other',
    ])

    view.close()
  }, 120_000)
})
