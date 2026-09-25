import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { race } from '#tests/helpers/race'
import { generatePassword } from '#tests/helpers/seed'
import { answerCharge, sellOnTheTill, startTypedCharge } from '#tests/helpers/till'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-104 through the real route and screen: a sale is refused, quoting both figures, whenever it
// disagrees with what the till would charge. What a match writes is F-105's own suite. Decision
// 0096: a card charge is an attempt, and nothing is written until the reader has answered.

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
  member = await registerMember(app, 'charge-ordinary', generatePassword())

  barManager = await registerMember(app, 'charge-bar', barPassword)
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

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

function programme(suffix: string): { venueId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    return { venueId: made.venueId }
  }
  finally {
    database.close()
  }
}

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

const openTill = (venueId: string): Promise<Response> => send('POST', '/api/till', { venueId }, barManager.cookie)

const aCategory = async (): Promise<string> => created(await send('POST', '/api/admin/bar/categories', { name: named('Spirits') }))

const aProductIn = async (categoryId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId, ...over }))

const activate = (productId: string): Promise<Response> =>
  send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })

const addVariant = async (productId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single', ...over }))

const priceVariant = (variantId: string, pricePence: number): Promise<Response> =>
  send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today() })

// A single, priced, on-the-till size: the shape every charge test starts from.
async function aSellableProduct(over: Record<string, unknown> = {}): Promise<{ productId: string, variantId: string }> {
  const categoryId = await aCategory()
  const productId = await aProductIn(categoryId, over)
  const variantId = await addVariant(productId)
  await priceVariant(variantId, 250)
  await activate(productId)
  return { productId, variantId }
}

const charge = (venueId: string, lines: unknown[], expectedTotalPence: number, as = barManager.cookie): Promise<Response> =>
  sellOnTheTill(app.baseURL, { venueId, lines, expectedTotalPence }, as)

function attemptRow(id: string): { kind: string | null, status: string, entry_id: string | null } | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query('SELECT kind, status, entry_id FROM sumup_attempts WHERE id = ?').get(id) as { kind: string | null, status: string, entry_id: string | null } | null) ?? undefined
  }
  finally {
    database.close()
  }
}

async function tillSessionId(venueId: string): Promise<string> {
  const opened = await openTill(venueId)
  return (await opened.json() as { session: { id: string } }).session.id
}

function ledgerCounts(): { entries: number, lines: number } {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const entries = (database.query('SELECT count(*) AS n FROM ledger_entries').get() as { n: number }).n
    const lines = (database.query('SELECT count(*) AS n FROM ledger_lines').get() as { n: number }).n
    return { entries, lines }
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a matching total is accepted (F-104 criterion 1)', () => {
  test('the server confirms the same total it would price the basket at', async () => {
    const { venueId } = programme('charge-match')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const answered = await charge(venueId, [{ variantId, qty: 2 }], 500)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { ok: boolean, totalPence: number, entryId: string }
    expect(body.ok).toBe(true)
    expect(body.totalPence).toBe(500)
    // What a match actually commits (the ledger entry, its lines and the stock it depletes) is
    // F-105's own suite, `tests/e2e/till-sale-commit.test.ts`; this only proves the entry exists.
    expect(body.entryId).toBeTruthy()
  })
})

describe.skipIf(skip !== null)('a mismatched total is refused, quoting both figures (F-104 criteria 1, 2)', () => {
  test('the screen\'s figure and the till\'s own are both named, and nothing is written', async () => {
    const { venueId } = programme('charge-mismatch')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const answered = await charge(venueId, [{ variantId, qty: 2 }], 501)
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain('£5.01')
    expect(refusal).toContain('£5.00')
    expect(ledgerCounts()).toEqual(before)
  })

  test('a stale total, from a price changed after the screen last asked, is refused the same way', async () => {
    const { venueId } = programme('charge-stale')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    // The screen still holds 250; only the till's own recompute knows of this correction.
    await priceVariant(variantId, 300)

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 250)
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain('£2.50')
    expect(refusal).toContain('£3.00')
  })

  // Criterion 3: the corrected resubmission runs the full check again, and there is no bypass.
  test('resubmitting with the corrected total succeeds, the same way a first attempt would', async () => {
    const { venueId } = programme('charge-retry')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const first = await charge(venueId, [{ variantId, qty: 1 }], 999)
    expect(first.status).toBe(409)

    const corrected = await charge(venueId, [{ variantId, qty: 1 }], 250)
    expect(corrected.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('charging needs an open till session', () => {
  test('refused, naming what would unlock it', async () => {
    const { venueId } = programme('charge-no-session')
    const { variantId } = await aSellableProduct()

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 250)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('till session')
  })
})

describe.skipIf(skip !== null)('who may submit a sale', () => {
  test('the bar manager may, an ordinary member may not, a signed-out caller gets no further', async () => {
    const { venueId } = programme('charge-permission')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    expect((await charge(venueId, [{ variantId, qty: 1 }], 250, member.cookie)).status).toBe(403)
    expect((await request(app, 'POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 })).status).toBe(401)
    expect((await request(app, 'POST', '/api/till/payments', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250, kind: 'TYPED' })).status).toBe(401)
    expect((await charge(venueId, [{ variantId, qty: 1 }], 250)).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('a typed charge records nothing until the reader has answered (0096)', () => {
  test('the attempt holds the basket and writes nothing; Reader took it records the sale, once', async () => {
    const { venueId } = programme('typed-took')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const started = await startTypedCharge(app.baseURL, { venueId, lines: [{ variantId, qty: 2 }], expectedTotalPence: 500 }, barManager.cookie)
    expect(started.status).toBe(200)
    const attempt = await started.json() as { id: string, totalPence: number, launchUrl?: string }
    expect(attempt.totalPence).toBe(500)
    // Nothing to open: the figure is keyed by hand.
    expect(attempt.launchUrl).toBeUndefined()
    expect(ledgerCounts()).toEqual(before)
    expect(attemptRow(attempt.id)).toMatchObject({ kind: 'TYPED', status: 'STARTED', entry_id: null })

    const took = await answerCharge(app.baseURL, attempt.id, 'succeeded', barManager.cookie)
    expect(took.status).toBe(200)
    const answer = await took.json() as { status: string, receipt: { entryId: string, totalPence: number } }
    expect(answer.status).toBe('SUCCEEDED')
    expect(answer.receipt.totalPence).toBe(500)
    expect(ledgerCounts().entries).toBe(before.entries + 1)
    expect(attemptRow(attempt.id)).toMatchObject({ status: 'SUCCEEDED', entry_id: answer.receipt.entryId })

    const again = await answerCharge(app.baseURL, attempt.id, 'succeeded', barManager.cookie)
    expect((await again.json() as { status: string }).status).toBe('SUCCEEDED')
    expect(ledgerCounts().entries).toBe(before.entries + 1)
  })

  test('Card declined writes nothing, and a declined charge cannot then be recorded', async () => {
    const { venueId } = programme('typed-declined')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const attempt = await (await startTypedCharge(app.baseURL, { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, barManager.cookie)).json() as { id: string }
    const declined = await answerCharge(app.baseURL, attempt.id, 'declined', barManager.cookie)
    expect(declined.status).toBe(200)
    expect((await declined.json() as { status: string }).status).toBe('FAILED')
    expect(ledgerCounts()).toEqual(before)

    const tookAfter = await answerCharge(app.baseURL, attempt.id, 'succeeded', barManager.cookie)
    expect((await tookAfter.json() as { status: string }).status).toBe('FAILED')
    expect(ledgerCounts()).toEqual(before)
    expect((await answerCharge(app.baseURL, attempt.id, 'declined', barManager.cookie)).status).toBe(409)
  })

  // F-104 criterion 3 at the answer: the re-check runs against the database as it then stands.
  test('a price moved between the attempt and the answer is a mismatch, and nothing is written', async () => {
    const { venueId } = programme('typed-mismatch')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const attempt = await (await startTypedCharge(app.baseURL, { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, barManager.cookie)).json() as { id: string }
    await priceVariant(variantId, 300)

    const took = await (await answerCharge(app.baseURL, attempt.id, 'succeeded', barManager.cookie)).json() as { status: string, error: string | null }
    expect(took.status).toBe('MISMATCH')
    expect(took.error).toContain('£2.50')
    expect(took.error).toContain('£3.00')
    expect(ledgerCounts()).toEqual(before)
  })

  test('the one-step sale route refuses a card basket with money in it, and writes nothing', async () => {
    const { venueId } = programme('typed-one-step')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const refused = await send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, barManager.cookie)
    expect(refused.status).toBe(409)
    expect(await message(refused)).toContain('reader')
    expect(ledgerCounts()).toEqual(before)
  })

  test('an unanswered typed charge holds the close until somebody answers it', async () => {
    const { venueId } = programme('typed-close')
    const { variantId } = await aSellableProduct()
    const sessionId = await tillSessionId(venueId)

    const attempt = await (await startTypedCharge(app.baseURL, { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, barManager.cookie)).json() as { id: string }
    const held = await send('POST', '/api/till/close', { id: sessionId, actualZPence: 0 }, barManager.cookie)
    expect(held.status).toBe(409)
    expect(await message(held)).toContain('waiting for an answer')

    await answerCharge(app.baseURL, attempt.id, 'declined', barManager.cookie)
    expect((await send('POST', '/api/till/close', { id: sessionId, actualZPence: 0 }, barManager.cookie)).status).toBe(200)
  })

  test('the SumUp app\'s answer never records a typed charge', async () => {
    const { venueId } = programme('typed-no-callback')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const attempt = await (await startTypedCharge(app.baseURL, { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, barManager.cookie)).json() as { id: string }
    const callback = await send('POST', `/api/till/payments/${attempt.id}/complete`, { smpStatus: 'success', smpTxCode: 'TX1' }, barManager.cookie)
    expect(callback.status).toBe(409)
    expect(ledgerCounts()).toEqual(before)
    expect(attemptRow(attempt.id)?.status).toBe('STARTED')
  })

  // Two devices answering at once: the transitions are conditional writes (0001, 0003).
  test('two Reader took it answers racing record the sale exactly once', async () => {
    const { venueId } = programme('typed-race-took')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const attempt = await (await startTypedCharge(app.baseURL, { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, barManager.cookie)).json() as { id: string }
    const answers = await race(4, () => answerCharge(app.baseURL, attempt.id, 'succeeded', barManager.cookie))
    const bodies = await Promise.all(answers.map(async answer => answer.json() as Promise<{ receipt: unknown }>))

    expect(bodies.filter(body => body.receipt)).toHaveLength(1)
    expect(ledgerCounts().entries).toBe(before.entries + 1)
    expect(attemptRow(attempt.id)?.status).toBe('SUCCEEDED')
  })

  test('Reader took it racing Card declined lands one of them, and the ledger agrees with it', async () => {
    const { venueId } = programme('typed-race-both')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const attempt = await (await startTypedCharge(app.baseURL, { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, barManager.cookie)).json() as { id: string }
    await race(2, index => answerCharge(app.baseURL, attempt.id, index === 0 ? 'succeeded' : 'declined', barManager.cookie))

    const settled = attemptRow(attempt.id)?.status
    expect(['SUCCEEDED', 'FAILED']).toContain(settled!)
    expect(ledgerCounts().entries).toBe(before.entries + (settled === 'SUCCEEDED' ? 1 : 0))
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  // 0096: Charge shows the figure to key and records nothing; the answer at the reader decides.
  test('Charge asks for the reader\'s answer; Card declined brings the basket back; Reader took it records it', async () => {
    const { variantId } = await aSellableProduct({ name: named('Screen typed') })
    const { venueId } = programme('charge-screen-typed')
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${variantId}"]`)
    await click(view, `[data-test="variant-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)

    const before = ledgerCounts()
    await click(view, `[aria-label="Charge £2.50"]`)
    await waitFor(view, `document.querySelector('[data-test="reader-charge"]')`)
    expect(await textOf(view, '[data-test="reader-charge"]')).toContain('Key this into the reader')
    expect(await textOf(view, '[data-test="charge-amount-figure"]')).toContain('£2.50')
    expect(ledgerCounts()).toEqual(before)

    await click(view, '[data-test="card-declined"]')
    await waitFor(view, `document.querySelector('[data-test="charge-failure"]')`)
    expect(await textOf(view, '[data-test="charge-failure"]')).toContain('declined')
    expect(ledgerCounts()).toEqual(before)

    await waitFor(view, `document.querySelector('[aria-label="Charge £2.50"]')`)
    await click(view, `[aria-label="Charge £2.50"]`)
    await waitFor(view, `document.querySelector('[data-test="reader-took-it"]')`)
    await click(view, '[data-test="reader-took-it"]')
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, '[data-test="charge-confirmation"]')).toContain('Taken on the reader')
    expect(ledgerCounts().entries).toBe(before.entries + 1)
    view.close()
  }, 120_000)

  test('charging shows what to key into the reader, and starting the next sale clears the basket', async () => {
    const { variantId } = await aSellableProduct({ name: named('Screen charge') })
    const { venueId } = programme('charge-screen')
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${variantId}"]`)
    await click(view, `[data-test="variant-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)

    await click(view, `[aria-label="Charge £2.50"]`)
    await waitFor(view, `document.querySelector('[data-test="reader-took-it"]')`)
    await click(view, '[data-test="reader-took-it"]')
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, '[data-test="charge-confirmation"]')).toContain('£2.50')

    await click(view, '[data-test="next-sale"]')
    await waitFor(view, `!document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, 'body')).not.toContain('charge-confirmation')
    view.close()
  }, 120_000)

  test('a refused charge shows both figures and leaves the basket to correct', async () => {
    const { variantId } = await aSellableProduct({ name: named('Screen refusal') })
    const { venueId } = programme('charge-screen-refusal')
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${variantId}"]`)
    await click(view, `[data-test="variant-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)

    // A correction lands after the screen last asked, so its remembered total is now wrong.
    await priceVariant(variantId, 300)
    await click(view, `[aria-label="Charge £2.50"]`)

    await waitFor(view, `document.querySelector('[data-test="charge-failure"]')`)
    const refusal = await textOf(view, '[data-test="charge-failure"]')
    expect(refusal).toContain('£2.50')
    expect(refusal).toContain('£3.00')

    // The screen catches itself up to the true figure, so a second tap would now succeed.
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£3.00')`)
    view.close()
  }, 120_000)
})
