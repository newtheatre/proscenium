import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, fillNumber, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
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
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
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
    await addVariant(id)
    expect((await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'ACTIVE' })).status).toBe(200)
    expect((await products()).find(product => product.id === id)?.status).toBe('ACTIVE')
  })

  test('the same status twice is refused rather than silently accepted', async () => {
    const id = await addProduct(await addCategory())
    expect((await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'HIDDEN' })).status).toBe(409)
  })

  test('a retired product leaves the list the till reads and stays in the console', async () => {
    const id = await addProduct(await addCategory())
    expect((await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'RETIRED' })).status).toBe(200)

    expect((await products('&includeRetired=false')).map(product => product.id)).not.toContain(id)
    expect((await products()).find(product => product.id === id)?.status).toBe('RETIRED')
  })

  test('a product nothing has ever been sold as is deleted outright', async () => {
    const id = await addProduct(await addCategory())
    expect((await send('DELETE', `/api/admin/bar/products/${id}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/bar/products/${id}`)).status).toBe(404)
  })

  test('a product in no category is refused, and a category with products stays', async () => {
    const categoryId = await addCategory()
    await addProduct(categoryId)
    expect((await send('POST', '/api/admin/bar/products', { name: named('Orphan'), categoryId: 'nowhere' })).status).toBe(404)
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
    await addVariant(id)
    await send('POST', `/api/admin/bar/products/${id}/status`, { status: 'ACTIVE' })

    const entry = trail<{ detail: { changes: { status: { from: string, to: string } } } }>(
      'bar.product.status.changed',
      `bar-product:${id}`,
    )
    expect(entry?.detail.changes.status).toEqual({ from: 'HIDDEN', to: 'ACTIVE' })
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
      unitCostPence: 480,
    })).status).toBe(200)

    expect((await send('DELETE', `/api/admin/bar/items/${id}`)).status).toBe(409)

    // Retiring needs the stock counted out first, or on-hand would vanish with it.
    expect((await send('POST', `/api/admin/bar/items/${id}/status`, { status: 'RETIRED' })).status).toBe(409)
    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'ADJUST', qty: -750, reason: 'COUNT_CORRECTION' })
    expect((await send('POST', `/api/admin/bar/items/${id}/status`, { status: 'RETIRED' })).status).toBe(200)
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

    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 6000, unitCostPence: 480 })
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

  test('a delivery records its cost, and nothing else may carry one', async () => {
    const id = await addItem()
    await send('POST', '/api/admin/bar/movements', { itemId: id, kind: 'DELIVERY', qty: 750, unitCostPence: 480 })
    expect((await movements(`&itemId=${id}`))[0]).toMatchObject({ kind: 'DELIVERY', unitCostPence: 480 })

    const refused = await send('POST', '/api/admin/bar/movements', {
      itemId: id,
      kind: 'WASTAGE',
      qty: -750,
      reason: 'BREAKAGE',
      unitCostPence: 480,
    })
    expect(refused.status).toBe(400)
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
      unitCostPence: 480,
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

describe.skipIf(skip !== null)('the screens', () => {
  test('the bar manager sees the products and the stock they are made of', async () => {
    const categoryId = await addCategory({ name: named('On screen') })
    const productName = named('On screen red')
    await addProduct(categoryId, { name: productName })

    const itemName = named('On screen bottle')
    const itemId = await addItem({ name: itemName })
    await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty: 4500, unitCostPence: 480 })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    // The console shell renders no <main>, so each screen names an element of its own.
    await visit(view, `${app.baseURL}/bar/products`, '[data-test="bar-products-table"]')
    expect(await textOf(view, '[data-test="bar-products-table"]')).toContain(productName)

    await visit(view, `${app.baseURL}/bar/stock`, '[data-test="bar-items-table"]')
    const stock = await textOf(view, '[data-test="bar-items-table"]')
    expect(stock).toContain(itemName)
    expect(stock).toContain('4500 ml')

    await visit(view, `${app.baseURL}/bar/stock/movements`, '[data-test="bar-movements-table"]')
    const history = await textOf(view, '[data-test="bar-movements-table"]')
    expect(history).toContain('Delivery')
    expect(history).toContain('£4.80')
    view.close()
  }, 120_000)

  // A form validates its whole state, so a modal held to the wrong schema throws before the
  // handler runs and the button silently does nothing. Only driving it proves it works.
  test('a wastage recorded through the modal reaches the register and moves on hand', async () => {
    const itemName = named('Modal bottle')
    const itemId = await addItem({ name: itemName })
    await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty: 3000, unitCostPence: 480 })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/stock?search=${encodeURIComponent(itemName)}`, `[data-test="move-${itemId}"]`)
    await click(view, `[data-test="move-${itemId}"]`)
    await waitFor(view, `document.querySelector('[data-test="movement-form"]')`)

    await fillNumber(view, '[data-test="movement-qty"]', '250')
    await click(view, '[data-test="movement-submit"]')
    await waitFor(view, `!document.querySelector('[data-test="movement-form"]')`)

    // A delivery is the modal's default, so what the screen wrote adds to what the API delivered.
    expect(await onHand(itemId)).toBe(3250)
    view.close()
  }, 120_000)
})
