import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-109: a tab holder's account is itemised and live; settlement is bounded to exactly the
// charges it names; only an unsettled charge may be voided, and a void credits stock once.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
let barStaff: TestMember
const barManagerPassword = generatePassword()
const barStaffPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  barManager = await registerMember(app, 'settle-bar-manager', barManagerPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
  barStaff = await registerMember(app, 'settle-bar-staff', barStaffPassword)
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

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

function programme(suffix: string) {
  const database = new Database(app.databaseFile)
  try {
    return tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix })
  }
  finally {
    database.close()
  }
}

let nextSlot = 300
function confirmBarShift(performanceId: string, userId: string): void {
  const database = new Database(app.databaseFile)
  try {
    const id = `${performanceId}-BAR-${(nextSlot += 1)}`
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, performanceId, 'BAR', nextSlot, userId, 'CONFIRMED')
  }
  finally {
    database.close()
  }
}

function openTill(venueId: string, performanceId: string, as: string = barStaff.cookie): Promise<Response> {
  if (as === barStaff.cookie) confirmBarShift(performanceId, barStaff.id)
  return send('POST', '/api/till', { venueId }, as)
}

const aMember = (): Promise<TestMember> => registerMember(app, 'settle-member', generatePassword())
const authorise = (userIds: string[]): Promise<Response> => send('PUT', '/api/admin/config/BAR_AUTHORISED_TAB_HOLDERS', { value: userIds })

async function aSellableProduct(pricePence = 500): Promise<{ variantId: string, productId: string }> {
  const categoryAnswered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
  const { id: categoryId } = await categoryAnswered.json() as { id: string }
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId })
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const { id: variantId } = await variantAnswered.json() as { id: string }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today })
  await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
  return { variantId, productId }
}

const chargeToTab = (venueId: string, variantId: string, tabHolderId: string, pricePence: number, as = barStaff.cookie): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: pricePence, tabHolderId }, as)

interface OutstandingCharge { entryId: string, totalPence: number }

const settleCandidates = (venueId: string, holderId: string, as = barStaff.cookie): Promise<Response> =>
  send('GET', `/api/till/tab-settlements?venueId=${venueId}&holderId=${holderId}`, undefined, as)

const settle = (venueId: string, holderId: string, entryIds: string[], expectedTotalPence: number, as = barStaff.cookie): Promise<Response> =>
  send('POST', '/api/till/tab-settlements', { venueId, holderId, entryIds, expectedTotalPence }, as)

const voidCharge = (entryId: string, reason: string, as: string): Promise<Response> =>
  send('POST', `/api/admin/bar/tab-charges/${entryId}/void`, { reason }, as)

interface StockMovementRow { qty: number, kind: string, reverses_id: string | null }

function movementsFor(itemId: string): StockMovementRow[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT qty, kind, reverses_id FROM stock_movements WHERE item_id = ? ORDER BY rowid').all(itemId) as StockMovementRow[]
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a holder\'s account is itemised with a live balance (criterion 1)', () => {
  test('every charge appears with its lines, and the balance matches', async () => {
    const { venueId, performanceId } = programme(`settle-itemise-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])

    expect((await chargeToTab(venueId, variantId, member.id, 500)).status).toBe(200)
    expect((await chargeToTab(venueId, variantId, member.id, 500)).status).toBe(200)

    const answered = await send('GET', '/api/account/tab', undefined, member.cookie)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { tab: { outstandingPence: number, charges: { totalPence: number, lines: unknown[] }[] } }
    expect(body.tab.outstandingPence).toBe(1000)
    expect(body.tab.charges).toHaveLength(2)
    expect(body.tab.charges[0]!.lines).toHaveLength(1)
  })
})

describe.skipIf(skip !== null)('settlement is cross-checked and posts a bounded entry (criterion 2)', () => {
  test('settling the exact charges named succeeds, and the entry references only them', async () => {
    const { venueId, performanceId } = programme(`settle-basic-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])

    await chargeToTab(venueId, variantId, member.id, 500)
    await chargeToTab(venueId, variantId, member.id, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    expect(charges).toHaveLength(2)
    const entryIds = charges.map(charge => charge.entryId)

    const answered = await settle(venueId, member.id, entryIds, 1000)
    expect(answered.status).toBe(200)

    const after = await send('GET', '/api/account/tab', undefined, member.cookie)
    const body = await after.json() as { tab: { outstandingPence: number } }
    expect(body.tab.outstandingPence).toBe(0)
  })

  test('a mismatched expected total is refused, quoting both figures, and nothing is taken', async () => {
    const { venueId, performanceId } = programme(`settle-mismatch-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member.id, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }

    const answered = await settle(venueId, member.id, [charges[0]!.entryId], 999)
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain('£9.99')
    expect(refusal).toContain('£5.00')

    const after = await send('GET', '/api/account/tab', undefined, member.cookie)
    const body = await after.json() as { tab: { outstandingPence: number } }
    expect(body.tab.outstandingPence).toBe(500)
  })
})

describe.skipIf(skip !== null)('settlement is bounded to the charges it covers (criterion 3)', () => {
  test('a charge posted concurrently with a settlement stays outstanding', async () => {
    const { venueId, performanceId } = programme(`settle-concurrent-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])

    await chargeToTab(venueId, variantId, member.id, 500)
    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    expect(charges).toHaveLength(1)

    // The settlement and a fresh charge fire at once: the settlement was bounded to the one id
    // it read before either request left the till, so the race has only one honest outcome.
    const [settled, secondCharge] = await Promise.all([
      settle(venueId, member.id, [charges[0]!.entryId], 500),
      chargeToTab(venueId, variantId, member.id, 500),
    ])

    expect(settled.status).toBe(200)
    expect(secondCharge.status).toBe(200)

    const after = await send('GET', '/api/account/tab', undefined, member.cookie)
    const body = await after.json() as { tab: { outstandingPence: number, charges: { entryId: string, settledAt: number | null }[] } }
    expect(body.tab.outstandingPence).toBe(500)
    expect(body.tab.charges).toHaveLength(2)
    const settledCount = body.tab.charges.filter(charge => charge.settledAt !== null).length
    expect(settledCount).toBe(1)
  })

  test('a settlement naming a charge that was voided from under it is refused, taking nothing', async () => {
    const { venueId, performanceId } = programme(`settle-voided-under-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member.id, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }

    expect((await voidCharge(charges[0]!.entryId, 'Charged in error', barManager.cookie)).status).toBe(200)

    const answered = await settle(venueId, member.id, [charges[0]!.entryId], 500)
    expect(answered.status).toBe(409)
  })
})

describe.skipIf(skip !== null)('only an unsettled charge may be voided, by the bar manager, with a reason (criterion 4)', () => {
  test('ordinary bar staff cannot void', async () => {
    const { venueId, performanceId } = programme(`settle-void-authority-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member.id, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }

    const answered = await voidCharge(charges[0]!.entryId, 'Wrong member', barStaff.cookie)
    expect(answered.status).toBe(403)
  })

  test('no reason is refused', async () => {
    const { venueId, performanceId } = programme(`settle-void-noreason-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member.id, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }

    const answered = await send('POST', `/api/admin/bar/tab-charges/${charges[0]!.entryId}/void`, {}, barManager.cookie)
    expect(answered.status).toBe(400)
  })

  test('a settled charge cannot be voided', async () => {
    const { venueId, performanceId } = programme(`settle-void-settled-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member.id, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    await settle(venueId, member.id, [charges[0]!.entryId], 500)

    const answered = await voidCharge(charges[0]!.entryId, 'Too late', barManager.cookie)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('refund')
  })
})

describe.skipIf(skip !== null)('a void credits stock exactly once (criterion 5)', () => {
  test('the credit matches the depletion, and a second void is refused', async () => {
    const { venueId, performanceId } = programme(`settle-void-stock-${crypto.randomUUID().slice(0, 6)}`)
    const categoryAnswered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
    const { id: categoryId } = await categoryAnswered.json() as { id: string }
    const itemAnswered = await send('POST', '/api/admin/bar/items', { name: named('Gin'), unit: 'ML', containerMl: 700 })
    const { id: itemId } = await itemAnswered.json() as { id: string }
    await send('POST', '/api/admin/bar/movements', { itemId, qty: 700, kind: 'DELIVERY' })
    const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId })
    const { id: productId } = await productAnswered.json() as { id: string }
    const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
    const { id: variantId } = await variantAnswered.json() as { id: string }
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 50 }] })
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 500, effectiveFrom: today })
    await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })

    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member.id, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    const entryId = charges[0]!.entryId

    const before = movementsFor(itemId)
    expect(before.reduce((sum, row) => sum + row.qty, 0)).toBe(650)

    const first = await voidCharge(entryId, 'Charged in error', barManager.cookie)
    expect(first.status).toBe(200)

    const after = movementsFor(itemId)
    expect(after.reduce((sum, row) => sum + row.qty, 0)).toBe(700)

    const second = await voidCharge(entryId, 'Trying again', barManager.cookie)
    expect(second.status).toBe(409)

    const stillAfter = movementsFor(itemId)
    expect(stillAfter.reduce((sum, row) => sum + row.qty, 0)).toBe(700)
  })
})
