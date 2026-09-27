import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { clearConfigOverride, overrideConfig } from '#tests/helpers/config'
import { sqliteTarget } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
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
let barShift: TestMember
let fohManager: TestMember
const barPassword = generatePassword()
const barShiftPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  member = await registerMember(app, 'ordinary', generatePassword())
  barShift = await registerMember(app, 'barshift', barShiftPassword)

  barManager = await registerMember(app, 'barmanager', barPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)

  fohManager = await registerMember(app, 'fohmanager', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: fohManager.id, role: 'FOH_MANAGER' }, officer.cookie)
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

// These items have no one container size, so a delivery is costed whole (0100): the figure sent is
// what each unit cost times how many came.
const deliver = async (itemId: string, qty: number, pencePerUnit?: number): Promise<void> => {
  const costPence = pencePerUnit === undefined ? undefined : pencePerUnit * qty
  const answered = await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty, costPence })
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

// The count the register holds for one line, read back through the route rather than the screen.
const countedOf = async (stocktakeId: string, itemId: string): Promise<number | null | undefined> =>
  (await view(stocktakeId)).lines.find(line => line.itemId === itemId)?.countedQty

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

  // The preview values a variance the same way the applied report does: a weighted average over
  // unreversed deliveries, not the most recent delivery's cost (review-stock 5).
  test('the preview is weighted across deliveries, and a reversed one drops out of the basis', async () => {
    const item = await anItem()
    await deliver(item.id, 10, 100)
    const second = await created(await send('POST', '/api/admin/bar/movements', {
      itemId: item.id, kind: 'DELIVERY', qty: 10, costPence: 9000,
    }))
    // Weighted: (10*100 + 10*900) / 20 = 500, not 900, which the most recent delivery alone would give.
    const opened = await open()
    await count(opened.stocktake.id, [{ itemId: item.id, counted: 19 }])
    const beforeReversal = await view(opened.stocktake.id)
    expect(beforeReversal.lines.find(candidate => candidate.itemId === item.id)!.varianceCostPence).toBe(-1 * 500)
    await apply(opened.stocktake.id)

    // Reversing the second delivery leaves only the first in the weighted basis.
    await send('POST', '/api/admin/bar/movements', {
      itemId: item.id, kind: 'REVERSAL', qty: -10, reason: 'COUNT_CORRECTION', reversesId: second,
    })
    const reopened = await open()
    await count(reopened.stocktake.id, [{ itemId: item.id, counted: 8 }])
    const afterReversal = await view(reopened.stocktake.id)
    expect(afterReversal.lines.find(candidate => candidate.itemId === item.id)!.varianceCostPence).toBe(-1 * 100)
    await apply(reopened.stocktake.id)
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

// Decision 0099 (issue 1322): the whole register was one person's phone job, so tonight's confirmed
// bar shift may enter counts while a stocktake is open. Open and Apply stay with bar.stocktake.
describe.skipIf(skip !== null)('tonight\'s confirmed bar shift may enter counts (0099)', () => {
  let slot = 700

  // A shift on tonight's performance, in the state and the window the test needs (0078).
  function aBarShift(userId: string, status: 'CONFIRMED' | 'CLAIMED', window?: { startsAt: number, endsAt: number }): void {
    const database = new Database(app.databaseFile)
    try {
      const { performanceId } = tonightsPerformance(sqliteTarget(database), { suffix: `count-${(slot += 1)}` })
      database.query(`INSERT INTO shifts (id, performance_id, role, slot, user_id, status, starts_at, ends_at)
        VALUES (?, ?, 'BAR', ?, ?, ?, ?, ?)`)
        .run(`${performanceId}-BAR-${slot}`, performanceId, slot, userId, status, window?.startsAt ?? null, window?.endsAt ?? null)
    }
    finally {
      database.close()
    }
  }

  function clearShifts(userId: string): void {
    const database = new Database(app.databaseFile)
    try {
      database.query(`UPDATE shifts SET status = 'CANCELLED' WHERE user_id = ?`).run(userId)
    }
    finally {
      database.close()
    }
  }

  test('a confirmed bar shift inside its window counts, and the line says who counted it', async () => {
    const item = await anItem()
    await deliver(item.id, 10)
    const opened = await open()
    aBarShift(barShift.id, 'CONFIRMED')
    try {
      expect((await count(opened.stocktake.id, [{ itemId: item.id, counted: 9 }], barShift.cookie)).status).toBe(200)
      const answered = await send('GET', `/api/admin/bar/stocktakes/${opened.stocktake.id}`, undefined, barShift.cookie)
      expect(answered.status).toBe(200)
      const { lines } = await answered.json() as { lines: StocktakeLine[] }
      const line = lines.find(one => one.itemId === item.id)
      expect(line?.countedQty).toBe(9)
      expect(line?.countedByName).toBe(barShift.name)
    }
    finally {
      clearShifts(barShift.id)
      await apply(opened.stocktake.id)
    }
  })

  test('a shift claimed but not confirmed may not count', async () => {
    const item = await anItem()
    const opened = await open()
    aBarShift(barShift.id, 'CLAIMED')
    try {
      expect((await count(opened.stocktake.id, [{ itemId: item.id, counted: 1 }], barShift.cookie)).status).toBe(403)
      expect((await view(opened.stocktake.id)).lines.find(one => one.itemId === item.id)?.countedQty).toBeNull()
    }
    finally {
      clearShifts(barShift.id)
      await apply(opened.stocktake.id)
    }
  })

  test('a shift whose window has ended may not count', async () => {
    const item = await anItem()
    const opened = await open()
    const now = Math.floor(Date.now() / 1000)
    // Ended three hours ago, well past the grace a late volunteer is allowed (0078).
    aBarShift(barShift.id, 'CONFIRMED', { startsAt: now - 5 * 3600, endsAt: now - 3 * 3600 })
    try {
      expect((await count(opened.stocktake.id, [{ itemId: item.id, counted: 1 }], barShift.cookie)).status).toBe(403)
      expect((await view(opened.stocktake.id)).lines.find(one => one.itemId === item.id)?.countedQty).toBeNull()
    }
    finally {
      clearShifts(barShift.id)
      await apply(opened.stocktake.id)
    }
  })

  test('the bar shift may not open or apply a stocktake', async () => {
    const opened = await open()
    aBarShift(barShift.id, 'CONFIRMED')
    try {
      expect((await apply(opened.stocktake.id, barShift.cookie)).status).toBe(403)
      await apply(opened.stocktake.id)
      expect((await send('POST', '/api/admin/bar/stocktakes', undefined, barShift.cookie)).status).toBe(403)
    }
    finally {
      clearShifts(barShift.id)
    }
  })

  test('the Bar Manager\'s own count is named too, so every line can be reviewed before Apply', async () => {
    const item = await anItem()
    const opened = await open()
    await count(opened.stocktake.id, [{ itemId: item.id, counted: 0 }])
    const { lines } = await view(opened.stocktake.id)
    expect(lines.find(one => one.itemId === item.id)?.countedByName).toBe(barManager.name)
    await apply(opened.stocktake.id)
  })

  test('the open stocktake is read by the bar shift, and by nobody else without bar access', async () => {
    const opened = await open()
    aBarShift(barShift.id, 'CONFIRMED')
    try {
      const answered = await send('GET', '/api/admin/bar/stocktakes/open', undefined, barShift.cookie)
      expect(answered.status).toBe(200)
      expect((await answered.json() as { stocktake: Stocktake | null }).stocktake?.id).toBe(opened.stocktake.id)
      expect((await send('GET', '/api/admin/bar/stocktakes/open', undefined, member.cookie)).status).toBe(403)

      // Once applied it is closed, and the shift reads only the stocktake it may count into.
      await apply(opened.stocktake.id)
      expect((await send('GET', `/api/admin/bar/stocktakes/${opened.stocktake.id}`, undefined, barShift.cookie)).status).toBe(403)
    }
    finally {
      clearShifts(barShift.id)
      await apply(opened.stocktake.id)
    }
  })

  // The Front of House Manager takes the full count (0099): open, count and apply on any day, with
  // no shift, and neither the catalogue, its prices and discounts, nor the rest of the register.
  test('the Front of House Manager opens, counts and applies a stocktake, and nothing else of the bar', async () => {
    const item = await anItem()
    await deliver(item.id, 10)
    const opened = await open(fohManager.cookie)
    expect((await count(opened.stocktake.id, [{ itemId: item.id, counted: 8 }], fohManager.cookie)).status).toBe(200)
    const answered = await send('GET', `/api/admin/bar/stocktakes/${opened.stocktake.id}`, undefined, fohManager.cookie)
    expect(answered.status).toBe(200)
    const { lines } = await answered.json() as { lines: StocktakeLine[] }
    expect(lines.find(one => one.itemId === item.id)?.countedByName).toBe(fohManager.name)
    expect((await send('GET', '/api/admin/bar/stocktakes', undefined, fohManager.cookie)).status).toBe(200)
    expect((await apply(opened.stocktake.id, fohManager.cookie)).status).toBe(200)

    for (const path of ['/api/admin/bar/products', '/api/admin/bar/items', '/api/admin/bar/discounts', '/api/admin/bar/movements', '/api/admin/bar/categories']) {
      expect(`${path} ${(await send('GET', path, undefined, fohManager.cookie)).status}`).toBe(`${path} 403`)
    }
  })

  // Issue 1321's count is blind: the shift is sent no expected figure, nor a variance or cost it
  // could be worked back from, while a holder of bar.stocktake reads them all (0099).
  test('the bar shift counts blind: no expected figure, variance or cost comes back to it', async () => {
    const item = await anItem()
    await deliver(item.id, 10)
    const opened = await open()
    aBarShift(barShift.id, 'CONFIRMED')
    try {
      const blind = async (answered: Response): Promise<boolean> => {
        expect(answered.status).toBe(200)
        const { lines } = await answered.json() as { lines: StocktakeLine[] }
        return lines.length > 0 && lines.every(line => line.expectedQty === null && line.variance === null && line.varianceCostPence === null)
      }
      expect(await blind(await count(opened.stocktake.id, [{ itemId: item.id, counted: 7 }], barShift.cookie))).toBe(true)
      expect(await blind(await send('GET', '/api/admin/bar/stocktakes/open', undefined, barShift.cookie))).toBe(true)
      expect(await blind(await send('GET', `/api/admin/bar/stocktakes/${opened.stocktake.id}`, undefined, barShift.cookie))).toBe(true)

      const held = (await view(opened.stocktake.id)).lines.find(one => one.itemId === item.id)
      expect(held?.expectedQty).toBe(10)
      expect(held?.variance).toBe(-3)
    }
    finally {
      clearShifts(barShift.id)
      await apply(opened.stocktake.id)
    }
  })

  // A shift carries no second-factor gate (0044), so a role holder with no authenticator still
  // counts through tonight's bar shift, as the till lets them sell, and counts blind as it does.
  test('a role holder with no authenticator counts through tonight\'s bar shift', async () => {
    const item = await anItem()
    const opened = await open()
    overrideConfig(app, 'PRIVILEGED_ROLES', ['FOH_MANAGER'])
    try {
      expect((await count(opened.stocktake.id, [{ itemId: item.id, counted: 2 }], fohManager.cookie)).status).toBe(403)
      aBarShift(fohManager.id, 'CONFIRMED')
      const answered = await count(opened.stocktake.id, [{ itemId: item.id, counted: 2 }], fohManager.cookie)
      expect(answered.status).toBe(200)
      const { lines } = await answered.json() as { lines: StocktakeLine[] }
      expect(lines.find(one => one.itemId === item.id)?.expectedQty).toBeNull()
      expect((await send('GET', '/api/admin/bar/stocktakes/open', undefined, fohManager.cookie)).status).toBe(200)
      expect(await countedOf(opened.stocktake.id, item.id)).toBe(2)
    }
    finally {
      clearConfigOverride(app, 'PRIVILEGED_ROLES')
      clearShifts(fohManager.id)
      await apply(opened.stocktake.id)
    }
  })

  // The volunteer cannot reach the console, so the count is taken from tonight's own screens.
  test('the bar shift counts from tonight\'s own screen, reached from its hub', async () => {
    const item = await anItem()
    const opened = await open()
    aBarShift(barShift.id, 'CONFIRMED')
    const screen = await openSignedOutView(app.baseURL, { width: 375, height: 812 })
    try {
      await visit(screen, `${app.baseURL}/sign-in`)
      await fill(screen, 'form input[type="email"]', barShift.email)
      await fill(screen, 'form input[type="password"]', barShiftPassword)
      await click(screen, 'form button[type="submit"]')
      await waitFor(screen, `document.querySelector('[data-test="account-menu"]')`)

      await visit(screen, `${app.baseURL}/tonight`, '[data-test="tile-stocktake"]')
      await visit(screen, `${app.baseURL}/tonight/stocktake`, `[data-test="counted-${item.id}"]`)
      await fillNumber(screen, `[data-test="counted-${item.id}"]`, '5')
      await waitFor(screen, `document.querySelector('[data-test="line-state-${item.id}"]')?.textContent.includes('Saved')`)
      const held = (await view(opened.stocktake.id)).lines.find(one => one.itemId === item.id) as StocktakeLine
      expect(held.countedQty).toBe(5)
      expect(held.countedByName).toBe(barShift.name)
      expect(await screen.evaluate<boolean>(`Boolean(document.querySelector('[data-test="open-apply"]'))`)).toBe(false)
      expect(await screen.evaluate<boolean>(`Boolean(document.querySelector('[data-test="expected-${item.id}"]'))`)).toBe(false)
    }
    finally {
      screen.close()
      clearShifts(barShift.id)
      await apply(opened.stocktake.id)
    }
  }, 120_000)
})

describe.skipIf(skip !== null)('the screen', () => {
  // Issue 1321: a count is saved line by line as it is typed, so Apply has nothing left to lose.
  test('a typed count saves on its own, and Apply names what it will post (F-115 criteria 3, 4)', async () => {
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
    await waitFor(view, `document.querySelector('[data-test="line-state-${item.id}"]')?.textContent.includes('Saved')`)
    expect(await countedOf(opened.stocktake.id, item.id)).toBe(7)

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
    await waitFor(view, `document.querySelector('[data-test="count-fields-${first.id}"]').querySelectorAll('button').length === 0`)
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
      `[...document.querySelectorAll('[data-test^="counted-"]:not([data-test^="counted-part-"])')].map(el => el.getAttribute('data-test'))`,
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

  test('filtering to only uncounted once every line is counted reads as done, not empty', async () => {
    const item = await anItem()
    await deliver(item.id, 10)
    const opened = await open()
    await count(opened.stocktake.id, [{ itemId: item.id, counted: 10 }])

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
    await click(view, '[data-test="uncounted-only-filter"]')
    await waitFor(view, `document.querySelector('[data-test="stocktake-lines"]').textContent.includes('Everything is counted')`)

    view.close()
    await apply(opened.stocktake.id)
  }, 120_000)
})

// Issue 1321 (F-115): the count asked for millilitres in 32 px fields, lost what was not saved,
// showed the expected figure before counting and ordered the lines by name alone.
describe.skipIf(skip !== null)('the count is taken on a phone, shelf by shelf (issue 1321)', () => {
  async function signedIn(width = 375): Promise<Bun.WebView> {
    const screen = await openSignedOutView(app.baseURL, { width, height: 812 })
    await visit(screen, `${app.baseURL}/sign-in`)
    await fill(screen, 'form input[type="email"]', barManager.email)
    await fill(screen, 'form input[type="password"]', barPassword)
    await click(screen, 'form button[type="submit"]')
    await waitFor(screen, `document.querySelector('[data-test="account-menu"]')`)
    return screen
  }

  test('a bottle is counted as full ones plus the open one, and kept in millilitres', async () => {
    const item = await anItem({ containerMl: 750 })
    await deliver(item.id, 3000)
    const opened = await open()

    const screen = await signedIn()
    try {
      await visit(screen, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
      await fillNumber(screen, `[data-test="counted-${item.id}"]`, '3')
      await fillNumber(screen, `[data-test="counted-part-${item.id}"]`, '375')
      await waitFor(screen, `document.querySelector('[data-test="line-state-${item.id}"]')?.textContent.includes('Saved')`)
      expect(await countedOf(opened.stocktake.id, item.id)).toBe(2625)
      expect(await textOf(screen, `[data-test="line-${item.id}"]`)).toContain('2625 ml')
    }
    finally {
      screen.close()
    }
    await apply(opened.stocktake.id)
  }, 120_000)

  test('the expected figure stays hidden until the line is counted', async () => {
    const item = await anItem()
    await deliver(item.id, 40)
    const opened = await open()

    const screen = await signedIn()
    try {
      await visit(screen, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
      expect(await textOf(screen, `[data-test="line-${item.id}"]`)).not.toContain('40 ml')
      await fillNumber(screen, `[data-test="counted-${item.id}"]`, '38')
      await waitFor(screen, `document.querySelector('[data-test="expected-${item.id}"]')`)
      expect(await textOf(screen, `[data-test="expected-${item.id}"]`)).toContain('40 ml')
      expect(await textOf(screen, `[data-test="variance-${item.id}"]`)).toContain('-2 ml')
    }
    finally {
      screen.close()
    }
    await apply(opened.stocktake.id)
  }, 120_000)

  test('a count typed and left is still there on the next visit', async () => {
    const item = await anItem()
    await deliver(item.id, 10)
    const opened = await open()

    const screen = await signedIn()
    try {
      const page = `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`
      await visit(screen, page, `[data-test="counted-${item.id}"]`)
      await fillNumber(screen, `[data-test="counted-${item.id}"]`, '9')
      await waitFor(screen, `document.querySelector('[data-test="line-state-${item.id}"]')?.textContent.includes('Saved')`)
      await visit(screen, page, `[data-test="counted-${item.id}"]`)
      expect(await screen.evaluate<string>(`document.querySelector('[data-test="counted-${item.id}"]').value`)).toBe('9')
    }
    finally {
      screen.close()
    }
    await apply(opened.stocktake.id)
  }, 120_000)

  test('lines sit under their stock group, in 48 px rows, over a footer that stays in view', async () => {
    const group = named('Spirits')
    const item = await anItem({ category: group, containerMl: 700 })
    await deliver(item.id, 700)
    const opened = await open()

    const screen = await signedIn()
    try {
      await visit(screen, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
      const heading = await screen.evaluate<string>(
        `document.querySelector('[data-test="line-${item.id}"]').closest('section').querySelector('h3').textContent`,
      )
      expect(heading).toContain(group)
      for (const field of [`counted-${item.id}`, `counted-part-${item.id}`]) {
        expect(await screen.evaluate<number>(`document.querySelector('[data-test="${field}"]').getBoundingClientRect().height`))
          .toBeGreaterThanOrEqual(48)
      }
      expect(await screen.evaluate<string>(`getComputedStyle(document.querySelector('[data-test="stocktake-footer"]')).position`))
        .toBe('sticky')
      expect(await textOf(screen, '[data-test="stocktake-footer"]')).toContain('counted')
      expect(await screen.evaluate<number>(`document.querySelector('[data-test="open-apply"]').getBoundingClientRect().height`))
        .toBeGreaterThanOrEqual(48)
    }
    finally {
      screen.close()
    }
    await apply(opened.stocktake.id)
  }, 120_000)

  // F-115 criteria 2 and 6: a cleared line is uncounted again, never a counted nought.
  test('clearing both halves of a measured count puts the line back to blank', async () => {
    const item = await anItem({ containerMl: 750 })
    const opened = await open()

    const screen = await signedIn()
    try {
      await visit(screen, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
      await fillNumber(screen, `[data-test="counted-${item.id}"]`, '3')
      await fillNumber(screen, `[data-test="counted-part-${item.id}"]`, '375')
      await waitFor(screen, `document.querySelector('[data-test="line-state-${item.id}"]')?.textContent.includes('Saved')`)
      expect(await countedOf(opened.stocktake.id, item.id)).toBe(2625)

      await fillNumber(screen, `[data-test="counted-${item.id}"]`, '')
      await fillNumber(screen, `[data-test="counted-part-${item.id}"]`, '')
      await waitFor(screen, `document.querySelector('[data-test="uncounted-badge-${item.id}"]')`)
      await waitFor(screen, `document.querySelector('[data-test="line-state-${item.id}"]')?.textContent.includes('Saved')`)
      expect(await countedOf(opened.stocktake.id, item.id)).toBeNull()
    }
    finally {
      screen.close()
    }
    await apply(opened.stocktake.id)
  }, 120_000)

  test('with only uncounted lines shown, a measured line stays until its open container is in', async () => {
    const item = await anItem({ containerMl: 750 })
    const opened = await open()

    const screen = await signedIn()
    try {
      await visit(screen, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
      await click(screen, '[data-test="uncounted-only-filter"]')
      await screen.evaluate(`document.querySelector('[data-test="counted-${item.id}"]').focus()`)
      await fill(screen, `[data-test="counted-${item.id}"]`, '3')
      await screen.evaluate(`document.querySelector('[data-test="counted-${item.id}"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
      await waitFor(screen, `document.activeElement?.getAttribute('data-test') === 'counted-part-${item.id}'`)

      // Leaving the open container at the nought worked out for it still releases the line.
      await screen.evaluate(`document.querySelector('[data-test="counted-part-${item.id}"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
      await screen.evaluate(`document.querySelector('[data-test="counted-part-${item.id}"]')?.blur()`)
      await waitFor(screen, `!document.querySelector('[data-test="line-${item.id}"]')`)
    }
    finally {
      screen.close()
    }
    await apply(opened.stocktake.id)
  }, 120_000)

  test('a count is whole millilitres, so a fraction of a bottle is not kept as one', async () => {
    const item = await anItem({ containerMl: 700 })
    const opened = await open()

    const screen = await signedIn()
    try {
      await visit(screen, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
      await fillNumber(screen, `[data-test="counted-${item.id}"]`, '0.7')
      await waitFor(screen, `document.querySelector('[data-test="line-state-${item.id}"]')?.textContent.includes('Saved')`)
      expect(await countedOf(opened.stocktake.id, item.id)).toBe(700)
    }
    finally {
      screen.close()
    }
    await apply(opened.stocktake.id)
  }, 120_000)

  // F-115 criteria 3 and 4: Apply never confirms over a line the register does not hold.
  test('a line that did not save stops Apply, which says so and asks nothing', async () => {
    const item = await anItem()
    const opened = await open()

    const screen = await signedIn()
    try {
      await visit(screen, `${app.baseURL}/bar/stock/stocktakes/${opened.stocktake.id}`, `[data-test="counted-${item.id}"]`)
      // Applied behind the screen's back, so the page still shows it open and every save is refused.
      await apply(opened.stocktake.id)
      await fillNumber(screen, `[data-test="counted-${item.id}"]`, '4')
      await waitFor(screen, `document.querySelector('[data-test="line-state-${item.id}"]')?.textContent.includes('Not saved')`)

      await click(screen, '[data-test="open-apply"]')
      await waitFor(screen, `document.querySelector('[data-test="stocktake-failure"]')?.textContent.includes('Some counts did not save')`)
      expect(await screen.evaluate<boolean>(`Boolean(document.querySelector('[data-test="apply-summary"]'))`)).toBe(false)
    }
    finally {
      screen.close()
    }
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

  // 0032, K-101: a bare table with no scope="col" and no right-aligned numbers.
  test('the screen shows shortfalls in a scoped, right-aligned table', async () => {
    const category = named('Screen spirits')
    const item = await anItem({ category })
    await send('PUT', `/api/admin/bar/items/${item.id}`, { name: item.name, unit: item.unit, parQty: 20, category })
    await deliver(item.id, 5)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/stock/order-list`, '[data-test="order-list-group"]')
    // Scoped to this test's own group: other tests in this shared app leave permanent
    // shortfalls behind, so more than one group renders on the page.
    const ownGroup = `[...document.querySelectorAll('[data-test="order-list-group"]')].find(el => el.textContent.includes(${JSON.stringify(category)}))`
    await waitFor(view, `!!(${ownGroup})`)
    expect(await view.evaluate<string>(`(${ownGroup}).textContent`)).toContain(item.name)
    expect(await view.evaluate<number>(`(${ownGroup}).querySelectorAll('th[scope="col"]').length`)).toBe(4)
    expect(await view.evaluate<string>(`(${ownGroup}).querySelector('th:last-child').textContent`)).toBe('Shortfall')
    view.close()
  }, 120_000)

  test('an unconfigured item links straight to its own row on the stock screen', async () => {
    const item = await anItem({ category: named('Unconfigured spirits') })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/stock/order-list`, `[data-test="unconfigured-${item.id}"]`)
    await click(view, `[data-test="unconfigured-${item.id}"]`)
    await waitFor(view, `document.querySelector('[data-test="bar-items-table"]')`)
    expect(await textOf(view, '[data-test="bar-items-table"]')).toContain(item.name)
    view.close()
  }, 120_000)
})
