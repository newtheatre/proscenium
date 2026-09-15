import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { expectOneWinner, race } from '#tests/helpers/race'
import { click, fill, fillNumber, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'
import type { OrderListRow, UnconfiguredRow } from '#shared/utils/ordering'

// F-115 (stocktakes) and F-120 (par levels and the suggested order list) through the real routes.
// The append-only stock ledger they read and write is F-114's, pinned in tests/integration.

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

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

const created = async (answered: Response): Promise<string> => {
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

interface ListedItem { id: string, name: string, unit: string, category: string | null }

// The full row back, not just the id: several tests need the name and unit again to save an
// edit, since the edit route validates its whole state rather than a partial patch.
const anItem = async (over: Record<string, unknown> = {}): Promise<ListedItem> => {
  const name = named('Gin')
  const id = await created(await send('POST', '/api/admin/bar/items', { name, unit: 'ML', ...over }))
  const answered = await send('GET', `/api/admin/bar/items?search=${encodeURIComponent(name)}`, undefined, officer.cookie)
  const { items } = await answered.json() as { items: ListedItem[] }
  return items.find(item => item.id === id)!
}

const deliver = async (itemId: string, qty: number, unitCostPence?: number): Promise<void> => {
  const answered = await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty, unitCostPence })
  expect(answered.status).toBe(200)
}

interface StocktakeOpened { ok: true, opened: boolean, stocktake: Stocktake, lines: StocktakeLine[] }

const open = async (as = barManager.cookie): Promise<StocktakeOpened> => {
  const answered = await send('POST', '/api/admin/bar/stocktakes', undefined, as)
  expect(answered.status).toBe(200)
  return answered.json() as Promise<StocktakeOpened>
}

const view = async (id: string): Promise<{ stocktake: Stocktake, lines: StocktakeLine[] }> => {
  const answered = await send('GET', `/api/admin/bar/stocktakes/${id}`)
  expect(answered.status).toBe(200)
  return answered.json() as Promise<{ stocktake: Stocktake, lines: StocktakeLine[] }>
}

const count = async (id: string, counts: { itemId: string, counted: number | null }[], as = barManager.cookie): Promise<Response> =>
  send('PUT', `/api/admin/bar/stocktakes/${id}/counts`, { counts }, as)

const apply = async (id: string, as = barManager.cookie): Promise<Response> =>
  send('POST', `/api/admin/bar/stocktakes/${id}/apply`, undefined, as)

function movementsFor(itemId: string): { qty: number, kind: string, refTable: string | null, refId: string | null }[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database
      .query('SELECT qty AS qty, kind AS kind, ref_table AS refTable, ref_id AS refId FROM stock_movements WHERE item_id = ?')
      .all(itemId) as { qty: number, kind: string, refTable: string | null, refId: string | null }[]
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('opening a stocktake captures on-hand at that moment (F-115 criterion 1)', () => {
  test('a line is captured with the current on-hand, unaffected by a later delivery', async () => {
    const item = await anItem()
    await deliver(item.id, 10)

    const opened = await open()
    expect(opened.lines.find(line => line.itemId === item.id)?.expectedQty).toBe(10)

    await deliver(item.id, 5)
    const held = await view(opened.stocktake.id)
    expect(held.lines.find(line => line.itemId === item.id)?.expectedQty).toBe(10)

    // Leave nothing open for the next test.
    await apply(opened.stocktake.id)
  })

  test('two racing opens resolve to the one stocktake', async () => {
    const answers = await race(3, () => open())
    const ids = new Set(answers.map(answer => answer.stocktake.id))
    expect(ids.size).toBe(1)
    expect(answers.filter(answer => answer.opened)).toHaveLength(1)

    await apply([...ids][0]!)
  })
})

describe.skipIf(skip !== null)('a blank count is distinct from an entered zero (F-115 criteria 2, 6)', () => {
  test('a blank line posts no adjustment; an entered zero that differs from expected does', async () => {
    const untouched = await anItem()
    const zeroed = await anItem()
    await deliver(untouched.id, 8)
    await deliver(zeroed.id, 8)

    const opened = await open()
    // untouched is never mentioned in the counts submission at all.
    await count(opened.stocktake.id, [{ itemId: zeroed.id, counted: 0 }])

    const held = await view(opened.stocktake.id)
    expect(held.lines.find(line => line.itemId === untouched.id)?.countedQty).toBeNull()
    expect(held.lines.find(line => line.itemId === untouched.id)?.variance).toBeNull()
    expect(held.lines.find(line => line.itemId === zeroed.id)?.variance).toBe(-8)

    const applied = await apply(opened.stocktake.id)
    expect(applied.status).toBe(200)

    expect(movementsFor(untouched.id).filter(m => m.kind === 'STOCKTAKE')).toEqual([])
    const posted = movementsFor(zeroed.id).filter(m => m.kind === 'STOCKTAKE')
    expect(posted).toHaveLength(1)
    expect(posted[0]!.qty).toBe(-8)
  })

  test('a count matching what was expected posts no adjustment either', async () => {
    const item = await anItem()
    await deliver(item.id, 12)
    const opened = await open()
    await count(opened.stocktake.id, [{ itemId: item.id, counted: 12 }])
    await apply(opened.stocktake.id)
    expect(movementsFor(item.id).filter(m => m.kind === 'STOCKTAKE')).toEqual([])
  })
})

describe.skipIf(skip !== null)('variance is shown in units and at cost before anything applies (F-115 criterion 3)', () => {
  test('variance and its cost read correctly ahead of applying', async () => {
    const item = await anItem()
    await deliver(item.id, 10, 480)
    const opened = await open()
    await count(opened.stocktake.id, [{ itemId: item.id, counted: 7 }])

    const held = await view(opened.stocktake.id)
    const line = held.lines.find(candidate => candidate.itemId === item.id)!
    expect(line.variance).toBe(-3)
    expect(line.varianceCostPence).toBe(-3 * 480)
    expect(held.stocktake.status).toBe('OPEN')

    await apply(opened.stocktake.id)
  })
})

describe.skipIf(skip !== null)('applying posts adjustments atomically and freezes the stocktake (F-115 criteria 4, 5)', () => {
  test('every varied item gets exactly one movement referencing its line, and the stocktake freezes', async () => {
    const a = await anItem()
    const b = await anItem()
    await deliver(a.id, 10)
    await deliver(b.id, 20)

    const opened = await open()
    await count(opened.stocktake.id, [{ itemId: a.id, counted: 12 }, { itemId: b.id, counted: 20 }])
    const applied = await apply(opened.stocktake.id)
    expect(applied.status).toBe(200)

    const aMoves = movementsFor(a.id).filter(m => m.kind === 'STOCKTAKE')
    expect(aMoves).toHaveLength(1)
    expect(aMoves[0]!.qty).toBe(2)
    expect(aMoves[0]!.refTable).toBe('stocktake_lines')
    expect(movementsFor(b.id).filter(m => m.kind === 'STOCKTAKE')).toEqual([])

    const after = await view(opened.stocktake.id)
    expect(after.stocktake.status).toBe('APPLIED')
    expect(after.stocktake.appliedAt).not.toBeNull()
  })

  test('a frozen stocktake refuses further counts, and nothing changes', async () => {
    const item = await anItem()
    await deliver(item.id, 5)
    const opened = await open()
    await apply(opened.stocktake.id)

    const refused = await count(opened.stocktake.id, [{ itemId: item.id, counted: 1 }])
    expect(refused.status).toBe(409)

    const held = await view(opened.stocktake.id)
    expect(held.lines.find(line => line.itemId === item.id)?.countedQty).toBeNull()
  })

  test('applying twice resolves to exactly one winner', async () => {
    const item = await anItem()
    await deliver(item.id, 5)
    const opened = await open()
    await count(opened.stocktake.id, [{ itemId: item.id, counted: 1 }])

    const answers = await race(3, () => apply(opened.stocktake.id))
    expectOneWinner(answers)
    expect(movementsFor(item.id).filter(m => m.kind === 'STOCKTAKE')).toHaveLength(1)
  })
})

describe.skipIf(skip !== null)('who may run a stocktake', () => {
  test('an ordinary member may not open, count or apply', async () => {
    const opened = await open()
    expect((await send('POST', '/api/admin/bar/stocktakes', undefined, member.cookie)).status).toBe(403)
    expect((await count(opened.stocktake.id, [], member.cookie)).status).toBe(403)
    expect((await apply(opened.stocktake.id, member.cookie)).status).toBe(403)
    await apply(opened.stocktake.id)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('Apply saves what was typed and never posted, and names it first (F-115 criteria 3, 4)', async () => {
    const item = await anItem()
    await deliver(item.id, 10, 480)
    const opened = await open()
    // A stocktake snapshots every active item in the catalogue, not just this test's own, so the
    // uncounted total after counting one line is whatever is left over from earlier tests.
    const uncountedAfter = opened.lines.length - 1

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
    await fillNumber(view, `[data-test="counted-${item.id}"]`, '7')

    // Apply without ever pressing Save counts: the typed figure must still reach the register.
    await click(view, '[data-test="open-apply"]')
    await waitFor(view, `document.querySelector('[data-test="apply-summary"]')`)
    expect(await textOf(view, '[data-test="apply-counted"]')).toContain('1')
    expect(await textOf(view, '[data-test="apply-uncounted"]')).toContain(String(uncountedAfter))
    // 7 counted against 10 expected, at 480 pence each: -3 * 480.
    expect(await textOf(view, '[data-test="apply-net-variance"]')).toContain('14.40')

    await click(view, '[data-test="confirm-apply"]')
    await waitFor(view, `!document.querySelector('[data-test="open-apply"]')`)
    view.close()

    const posted = movementsFor(item.id).filter(m => m.kind === 'STOCKTAKE')
    expect(posted).toHaveLength(1)
    expect(posted[0]!.qty).toBe(-3)
  }, 120_000)
})

describe.skipIf(skip !== null)('the screen counts on the floor (F-115 criterion 2)', () => {
  test('a full-width numeric input, no steppers, a blank badge, a filter and Enter advancing', async () => {
    const first = await anItem()
    const second = await anItem()
    const third = await anItem()
    // Sorts after every "Gin ..." item this file creates, so a next row always exists to focus.
    // anItem() cannot take a custom name: its own search-by-name lookup would then miss it.
    const guardResponse = await send('POST', '/api/admin/bar/items', { name: named('Zzz guard'), unit: 'ML' })
    expect(guardResponse.status).toBe(200)
    await deliver(first.id, 10)
    await deliver(second.id, 10)
    const opened = await open()
    void third

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${first.id}"]`)

    // A count of 750 or 1750 needs more than thirty pixels: no steppers, filling the cell.
    await waitFor(view, `document.querySelector('[data-test="counted-${first.id}"]').getAttribute('placeholder') === 'Uncounted'`)
    await waitFor(view, `document.querySelector('[data-test="counted-${first.id}"]').closest('td').querySelectorAll('button').length === 0`)
    expect(await textOf(view, `[data-test="uncounted-badge-${first.id}"]`)).toContain('Uncounted')

    await fillNumber(view, `[data-test="counted-${first.id}"]`, '7')
    await waitFor(view, `!document.querySelector('[data-test="uncounted-badge-${first.id}"]')`)

    // The uncounted-only filter drops the line just counted and keeps the one still blank.
    await click(view, '[data-test="uncounted-only-filter"]')
    await waitFor(view, `!document.querySelector('[data-test="counted-${first.id}"]')`)
    expect(await textOf(view, '[data-test="stocktake-lines"]')).toContain(second.name)
    await click(view, '[data-test="uncounted-only-filter"]')
    await waitFor(view, `document.querySelector('[data-test="counted-${first.id}"]')`)

    // Enter moves on to a different row. Which one depends on the random names' sort order, so
    // that is read back rather than assumed; only a next row's existence is pinned, by the guard.
    await view.evaluate(`document.querySelector('[data-test="counted-${first.id}"]').focus()`)
    await view.evaluate(`document.querySelector('[data-test="counted-${first.id}"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
    await waitFor(view, `document.activeElement?.getAttribute('data-test')?.startsWith('counted-') && document.activeElement.getAttribute('data-test') !== 'counted-${first.id}'`)

    // With the filter on, Enter on a row that is not first must not jump back to whatever the
    // filter now puts first: typing drops that row out of the filtered list before Enter runs.
    await click(view, '[data-test="uncounted-only-filter"]')
    const beforeTyping = await view.evaluate(
      `[...document.querySelectorAll('[data-test^="counted-"]')].map(el => el.getAttribute('data-test'))`,
    ) as string[]
    expect(beforeTyping.length).toBeGreaterThanOrEqual(3)
    const [, typedInto, expectedNext] = beforeTyping

    await fillNumber(view, `[data-test="${typedInto}"]`, '3')
    await view.evaluate(`document.querySelector('[data-test="${typedInto}"]').focus()`)
    await view.evaluate(`document.querySelector('[data-test="${typedInto}"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
    await waitFor(view, `document.activeElement?.getAttribute('data-test') === '${expectedNext}'`)

    view.close()
    await apply(opened.stocktake.id)
  }, 120_000)
})

describe.skipIf(skip !== null)('the suggested order list compares live on-hand to par (F-120)', () => {
  test('an item below par is listed with its shortfall, grouped by category', async () => {
    const category = named('Spirits')
    const item = await anItem({ category })
    await send('PUT', `/api/admin/bar/items/${item.id}`, { name: item.name, unit: item.unit, parQty: 20, category })
    await deliver(item.id, 5)

    const listed = await (await send('GET', '/api/admin/bar/order-list')).json() as { shortfalls: OrderListRow[], unconfigured: UnconfiguredRow[] }
    const row = listed.shortfalls.find(candidate => candidate.id === item.id)
    expect(row?.shortfall).toBe(15)
    expect(row?.onHand).toBe(5)
    expect(row?.category).toBe(category)
  })

  test('an item at or above par is not listed', async () => {
    const item = await anItem()
    await send('PUT', `/api/admin/bar/items/${item.id}`, { name: item.name, unit: item.unit, parQty: 5 })
    await deliver(item.id, 5)

    const listed = await (await send('GET', '/api/admin/bar/order-list')).json() as { shortfalls: OrderListRow[] }
    expect(listed.shortfalls.find(candidate => candidate.id === item.id)).toBeUndefined()
  })

  test('an item with no par level is listed separately as unconfigured, not as a shortfall', async () => {
    const item = await anItem()
    const listed = await (await send('GET', '/api/admin/bar/order-list')).json() as { shortfalls: OrderListRow[], unconfigured: UnconfiguredRow[] }
    expect(listed.shortfalls.find(candidate => candidate.id === item.id)).toBeUndefined()
    expect(listed.unconfigured.find(candidate => candidate.id === item.id)).toBeTruthy()
  })

  test('the export is CSV, guarded against a formula in a category name', async () => {
    const item = await anItem({ category: '=1+1' })
    await send('PUT', `/api/admin/bar/items/${item.id}`, { name: item.name, unit: item.unit, parQty: 10, category: item.category })

    const answered = await send('GET', '/api/admin/bar/order-list/export')
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/csv')
    const body = await answered.text()
    expect(body).toContain('"\'=1+1"')
  })

  test('an ordinary member may not read the order list', async () => {
    expect((await send('GET', '/api/admin/bar/order-list', undefined, member.cookie)).status).toBe(403)
  })
})
