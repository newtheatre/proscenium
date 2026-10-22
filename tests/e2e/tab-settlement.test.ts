import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, finishSignIn, grantRole, registerMember } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, pickOption, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import { putOnTheTill, tabCodeOf } from '#tests/helpers/bar'
import { answerCharge, settleOnTheReader } from '#tests/helpers/till'
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
  await grantRole(app, barManager, 'FOH_MANAGER', officer.cookie)
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
const setCap = (pence: number): Promise<Response> => send('PUT', '/api/admin/config/BAR_TAB_CAP_PENCE', { value: pence })

async function aSellableProduct(pricePence = 500): Promise<{ variantId: string, productId: string }> {
  const categoryAnswered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
  const { id: categoryId } = await categoryAnswered.json() as { id: string }
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId })
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const { id: variantId } = await variantAnswered.json() as { id: string }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today })
  await putOnTheTill(send, productId)
  return { variantId, productId }
}

const chargeToTab = async (venueId: string, variantId: string, holder: TestMember, pricePence: number, as = barStaff.cookie): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: pricePence, tabHolderId: holder.id, tabCode: await tabCodeOf(app.baseURL, holder.cookie) }, as)

interface OutstandingCharge { entryId: string, totalPence: number }

const settleCandidates = (venueId: string, holderId: string, as = barStaff.cookie): Promise<Response> =>
  send('GET', `/api/till/tab-settlements?venueId=${venueId}&holderId=${holderId}`, undefined, as)

const settle = (venueId: string, holderId: string, entryIds: string[], expectedTotalPence: number, as = barStaff.cookie): Promise<Response> =>
  settleOnTheReader(app, { venueId, holderId, entryIds, expectedTotalPence }, as)

const startSettling = (venueId: string, holderId: string, entryIds: string[], expectedTotalPence: number, as = barStaff.cookie): Promise<Response> =>
  send('POST', '/api/till/tab-settlements', { venueId, holderId, entryIds, expectedTotalPence }, as)

const voidCharge = (entryId: string, reason: string, as: string): Promise<Response> =>
  send('POST', `/api/admin/bar/tab-charges/${entryId}/void`, { reason }, as)

interface StockMovementRow { qty: number, kind: string, reason: string | null, reverses_id: string | null }

function movementsFor(itemId: string): StockMovementRow[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT qty, kind, reason, reverses_id FROM stock_movements WHERE item_id = ? ORDER BY rowid').all(itemId) as StockMovementRow[]
  }
  finally {
    database.close()
  }
}

function voidReasonOn(entryId: string): string | null {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query('SELECT void_reason AS reason FROM ledger_entries WHERE void_of_entry_id = ?').get(entryId) as { reason: string | null } | null)?.reason ?? null
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

    expect((await chargeToTab(venueId, variantId, member, 500)).status).toBe(200)
    expect((await chargeToTab(venueId, variantId, member, 500)).status).toBe(200)

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

    await chargeToTab(venueId, variantId, member, 500)
    await chargeToTab(venueId, variantId, member, 500)

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
    await chargeToTab(venueId, variantId, member, 500)

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

    await chargeToTab(venueId, variantId, member, 500)
    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    expect(charges).toHaveLength(1)

    // The settlement and a fresh charge fire at once: the settlement was bounded to the one id
    // it read before either request left the till, so the race has only one honest outcome.
    const [settled, secondCharge] = await Promise.all([
      settle(venueId, member.id, [charges[0]!.entryId], 500),
      chargeToTab(venueId, variantId, member, 500),
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
    await chargeToTab(venueId, variantId, member, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }

    expect((await voidCharge(charges[0]!.entryId, 'Charged in error', barManager.cookie)).status).toBe(200)

    const answered = await settle(venueId, member.id, [charges[0]!.entryId], 500)
    expect(answered.status).toBe(409)
  })
})

function attemptStatus(id: string): string | null {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query('SELECT status FROM sumup_attempts WHERE id = ?').get(id) as { status: string } | null)?.status ?? null
  }
  finally {
    database.close()
  }
}

async function owed(member: TestMember): Promise<number> {
  const answered = await send('GET', '/api/account/tab', undefined, member.cookie)
  return (await answered.json() as { tab: { outstandingPence: number } }).tab.outstandingPence
}

describe.skipIf(skip !== null)('a settlement is a card charge answered at the reader (0096, 0162)', () => {
  test('nothing is settled until the reader answers, and a declined card leaves the tab owed', async () => {
    const { venueId, performanceId } = programme(`settle-typed-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)
    const { charges } = await (await settleCandidates(venueId, member.id)).json() as { charges: OutstandingCharge[] }

    const started = await startSettling(venueId, member.id, [charges[0]!.entryId], 500)
    expect(started.status).toBe(200)
    const { id } = await started.json() as { id: string }
    expect(await owed(member)).toBe(500)

    expect((await answerCharge(app, id, 'declined', barStaff.cookie)).status).toBe(200)
    expect(attemptStatus(id)).toBe('FAILED')
    expect(await owed(member)).toBe(500)

    expect((await settle(venueId, member.id, [charges[0]!.entryId], 500)).status).toBe(200)
    expect(await owed(member)).toBe(0)
  })

  test('a tab already on the reader is not keyed in a second time', async () => {
    const { venueId, performanceId } = programme(`settle-twice-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)
    const { charges } = await (await settleCandidates(venueId, member.id)).json() as { charges: OutstandingCharge[] }

    expect((await startSettling(venueId, member.id, [charges[0]!.entryId], 500)).status).toBe(200)
    const second = await startSettling(venueId, member.id, [charges[0]!.entryId], 500)
    expect(second.status).toBe(409)
    expect(await message(second)).toContain('already on the reader')
  })

  // Matt's call (22 October 2026): the 0116 rule reaches the reader's answer too.
  test('a holder may key their own settlement but someone else answers the reader', async () => {
    const { venueId, performanceId } = programme(`settle-own-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    await authorise([barStaff.id])
    expect((await chargeToTab(venueId, variantId, barStaff, 500, barManager.cookie)).status).toBe(200)
    const { charges } = await (await settleCandidates(venueId, barStaff.id)).json() as { charges: OutstandingCharge[] }
    const entryIds = charges.map(charge => charge.entryId)
    const owedPence = charges.reduce((sum, charge) => sum + charge.totalPence, 0)

    const started = await startSettling(venueId, barStaff.id, entryIds, owedPence)
    expect(started.status).toBe(200)
    const { id } = await started.json() as { id: string }

    const own = await answerCharge(app, id, 'succeeded', barStaff.cookie)
    expect(own.status).toBe(403)
    expect(await message(own)).toContain('Nobody answers the reader for their own tab')

    const answered = await answerCharge(app, id, 'succeeded', barManager.cookie)
    expect(answered.status).toBe(200)
    expect((await answered.json() as { status: string }).status).toBe('SUCCEEDED')
  })

  // Both tills read no attempt and both would key the card: the guard has to ride the insert,
  // not a read before it, or the holder pays twice (0162).
  test('two tills keying the same tab at once leave one charge on the reader', async () => {
    const { venueId, performanceId } = programme(`settle-race-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)
    const { charges } = await (await settleCandidates(venueId, member.id)).json() as { charges: OutstandingCharge[] }

    const answers = await Promise.all([
      startSettling(venueId, member.id, [charges[0]!.entryId], 500),
      startSettling(venueId, member.id, [charges[0]!.entryId], 500, barManager.cookie),
    ])
    expect(answers.map(answer => answer.status).sort()).toEqual([200, 409])

    const database = new Database(app.databaseFile, { readonly: true })
    try {
      const held = database.query(`SELECT count(*) AS n FROM sumup_attempts WHERE json_extract(basket, '$.settlement.holderId') = ?`).get(member.id) as { n: number }
      expect(held.n).toBe(1)
    }
    finally {
      database.close()
    }
  })

  test('a charge voided while the reader was asked leaves the money to explain, not a settlement', async () => {
    const { venueId, performanceId } = programme(`settle-late-void-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)
    const { charges } = await (await settleCandidates(venueId, member.id)).json() as { charges: OutstandingCharge[] }

    const { id } = await (await startSettling(venueId, member.id, [charges[0]!.entryId], 500)).json() as { id: string }
    expect((await voidCharge(charges[0]!.entryId, 'Charged in error', barManager.cookie)).status).toBe(200)

    const answered = await answerCharge(app, id, 'succeeded', barStaff.cookie)
    const outcome = await answered.json() as { status: string, error: string | null }
    expect(outcome.status).toBe('MISMATCH')
    expect(outcome.error).toContain('no longer outstanding')
    expect(attemptStatus(id)).toBe('MISMATCH')
  })

  test('the picker lists everyone who owes, with what they owe', async () => {
    const { venueId, performanceId } = programme(`settle-holders-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)

    const answered = await send('GET', `/api/till/tab-settlements/holders?venueId=${venueId}`, undefined, barStaff.cookie)
    expect(answered.status).toBe(200)
    const { holders } = await answered.json() as { holders: { holderId: string, outstandingPence: number }[] }
    expect(holders.find(holder => holder.holderId === member.id)?.outstandingPence).toBe(500)
  })

  test('the till settles a tab from the screen: pick the holder, charge the reader, Reader took it', async () => {
    const { venueId, performanceId } = programme(`settle-screen-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barStaff.email)
    await fill(view, 'form input[type="password"]', barStaffPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barStaff.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, '[data-test="till-settle-tab"]')
    await click(view, '[data-test="till-settle-tab"]')
    await waitFor(view, `document.querySelector('[data-test="settle-holder"]')`)
    await pickOption(view, '[data-test="settle-holder"]', member.name)
    await waitFor(view, `document.querySelector('[data-test="settle-total"]')`)
    expect(await textOf(view, '[data-test="settle-total"]')).toContain('£5.00')

    await click(view, '[data-test="settle-start"]')
    await waitFor(view, `document.querySelector('[data-test="reader-charge"]')`)
    expect(await textOf(view, '[data-test="charge-amount-figure"]')).toContain('£5.00')
    expect(await owed(member)).toBe(500)

    await click(view, '[data-test="reader-took-it"]')
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, '[data-test="charge-confirmation"]')).toContain('Taken on the reader')
    expect(await owed(member)).toBe(0)
    view.close()
  }, 120_000)
})

describe.skipIf(skip !== null)('only an unsettled charge may be voided, by the Front of House Manager, with a reason (criterion 4)', () => {
  test('ordinary bar staff cannot void', async () => {
    const { venueId, performanceId } = programme(`settle-void-authority-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)

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
    await chargeToTab(venueId, variantId, member, 500)

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
    await chargeToTab(venueId, variantId, member, 500)

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
    const itemAnswered = await send('POST', '/api/admin/bar/items', { name: named('Gin'), unit: 'ML', containerMl: 700, ageRestricted: false })
    const { id: itemId } = await itemAnswered.json() as { id: string }
    await send('POST', '/api/admin/bar/movements', { itemId, qty: 700, kind: 'DELIVERY' })
    const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId })
    const { id: productId } = await productAnswered.json() as { id: string }
    const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
    const { id: variantId } = await variantAnswered.json() as { id: string }
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 50 }] })
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 500, effectiveFrom: today })
    await putOnTheTill(send, productId)

    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    const entryId = charges[0]!.entryId

    const before = movementsFor(itemId)
    expect(before.reduce((sum, row) => sum + row.qty, 0)).toBe(650)

    const first = await voidCharge(entryId, 'Charged in error', barManager.cookie)
    expect(first.status).toBe(200)

    const after = movementsFor(itemId)
    expect(after.reduce((sum, row) => sum + row.qty, 0)).toBe(700)

    // The reason column is the waste vocabulary F-204 groups by, so the operator's prose stays on
    // the entry that carries the void and never reaches the register (0011).
    const credit = after.find(row => row.kind === 'REVERSAL')!
    expect(credit.reason).toBe('COUNT_CORRECTION')
    expect(voidReasonOn(entryId)).toBe('Charged in error')

    const second = await voidCharge(entryId, 'Trying again', barManager.cookie)
    expect(second.status).toBe(409)

    const stillAfter = movementsFor(itemId)
    expect(stillAfter.reduce((sum, row) => sum + row.qty, 0)).toBe(700)
  })
})

describe.skipIf(skip !== null)('a voided charge leaves the balance, the cap and the year-end list (criteria 1, 6)', () => {
  test('the holder\'s balance returns to zero and the charge still shows, credited', async () => {
    const { venueId, performanceId } = programme(`settle-void-balance-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    expect((await voidCharge(charges[0]!.entryId, 'Charged in error', barManager.cookie)).status).toBe(200)

    const answered = await send('GET', '/api/account/tab', undefined, member.cookie)
    const body = await answered.json() as { tab: { outstandingPence: number, charges: { voided: boolean }[] } }
    expect(body.tab.outstandingPence).toBe(0)
    expect(body.tab.charges.some(charge => charge.voided)).toBe(true)
  })

  test('the credit a void posts is not itself a charge, so it cannot be voided', async () => {
    const { venueId, performanceId } = programme(`settle-void-credit-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    const voided = await voidCharge(charges[0]!.entryId, 'Charged in error', barManager.cookie)
    const { voidEntryId } = await voided.json() as { voidEntryId: string }

    const answered = await voidCharge(voidEntryId, 'Undoing the undo', barManager.cookie)
    expect(answered.status).toBe(404)

    const after = await send('GET', '/api/account/tab', undefined, member.cookie)
    const body = await after.json() as { tab: { outstandingPence: number } }
    expect(body.tab.outstandingPence).toBe(0)
  })

  test('the holder drops off the treasurer\'s unsettled list', async () => {
    const { venueId, performanceId } = programme(`settle-void-yearend-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await chargeToTab(venueId, variantId, member, 500)

    const listed = await send('GET', '/api/admin/bar/tabs')
    const before = await listed.json() as { holders: { holderId: string }[] }
    expect(before.holders.some(holder => holder.holderId === member.id)).toBe(true)

    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    await voidCharge(charges[0]!.entryId, 'Charged in error', barManager.cookie)

    const after = await send('GET', '/api/admin/bar/tabs')
    const body = await after.json() as { holders: { holderId: string }[] }
    expect(body.holders.some(holder => holder.holderId === member.id)).toBe(false)
  })

  test('a charge for the whole cap is accepted again after a void', async () => {
    const { venueId, performanceId } = programme(`settle-void-cap-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(2000)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await setCap(2000)

    expect((await chargeToTab(venueId, variantId, member, 2000)).status).toBe(200)
    const candidates = await settleCandidates(venueId, member.id)
    const { charges } = await candidates.json() as { charges: OutstandingCharge[] }
    await voidCharge(charges[0]!.entryId, 'Charged in error', barManager.cookie)

    const answered = await chargeToTab(venueId, variantId, member, 2000)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { tab: { outstandingPence: number } }
    expect(body.tab.outstandingPence).toBe(2000)
  })
})
