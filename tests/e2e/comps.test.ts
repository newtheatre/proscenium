import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-110: a comp sale requires a prior request with a reason; approval belongs to tonight's duty
// manager or the bar manager, never the requester, claimed atomically; it lapses on a timer.

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
  barManager = await registerMember(app, 'comp-bar-manager', barManagerPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
  barStaff = await registerMember(app, 'comp-bar-staff', barStaffPassword)
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

let nextSlot = 200
function confirmShift(performanceId: string, role: 'BAR' | 'DUTY_MANAGER', userId: string): void {
  const database = new Database(app.databaseFile)
  try {
    const id = `${performanceId}-${role}-${(nextSlot += 1)}`
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, performanceId, role, nextSlot, userId, 'CONFIRMED')
  }
  finally {
    database.close()
  }
}

function openTill(venueId: string, performanceId: string, as: string = barStaff.cookie): Promise<Response> {
  if (as === barStaff.cookie) confirmShift(performanceId, 'BAR', barStaff.id)
  return send('POST', '/api/till', { venueId }, as)
}

const aCategory = async (): Promise<string> => {
  const answered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
  return (await answered.json() as { id: string }).id
}

async function aSellableProduct(pricePence = 500, ageRestricted = false): Promise<{ variantId: string, productId: string }> {
  const categoryId = await aCategory()
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId, ageRestricted })
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const { id: variantId } = await variantAnswered.json() as { id: string }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today })
  await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
  return { variantId, productId }
}

interface AskInput { venueId: string, lines: unknown[], reason: string }
const ask = (input: AskInput, as = barStaff.cookie): Promise<Response> =>
  send('POST', '/api/till/comp-requests', input, as)
const approve = (id: string, as: string): Promise<Response> =>
  send('POST', `/api/till/comp-requests/${id}/approve`, {}, as)
const decline = (id: string, reason: string, as: string): Promise<Response> =>
  send('POST', `/api/till/comp-requests/${id}/decline`, { reason }, as)
const give = (id: string, venueId: string, expectedForegonePence: number, as = barStaff.cookie, ageCheck: unknown = null): Promise<Response> =>
  send('POST', `/api/till/comp-requests/${id}/sale`, { venueId, expectedForegonePence, ageCheck }, as)

interface LedgerEntryRow {
  tender: string
  total_pence: number
  comp_reason: string | null
  comp_approved_by: string | null
  actor_id: string
}
interface LedgerLineRow { amount_pence: number, unit_price_pence: number, qty: number }

function latestLedgerEntry(): LedgerEntryRow | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT * FROM ledger_entries ORDER BY rowid DESC LIMIT 1').get() as LedgerEntryRow | undefined
  }
  finally {
    database.close()
  }
}

function linesFor(entryId: string): LedgerLineRow[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT amount_pence, unit_price_pence, qty FROM ledger_lines WHERE entry_id = ?').all(entryId) as LedgerLineRow[]
  }
  finally {
    database.close()
  }
}

async function approvedRequest(pricePence = 500): Promise<{ id: string, venueId: string, performanceId: string, variantId: string }> {
  const { venueId, performanceId } = programme(`comps-${crypto.randomUUID().slice(0, 6)}`)
  const { variantId } = await aSellableProduct(pricePence)
  await openTill(venueId, performanceId)
  confirmShift(performanceId, 'DUTY_MANAGER', barManager.id)

  const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' })
  const { id } = await asked.json() as { id: string }
  await approve(id, barManager.cookie)
  return { id, venueId, performanceId, variantId }
}

describe.skipIf(skip !== null)('a comp sale requires a prior request with a reason (criterion 1)', () => {
  test('any bar-authorised till user may ask', async () => {
    const { venueId, performanceId } = programme(`comps-ask-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId)

    const answered = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' })
    expect(answered.status).toBe(200)
    const body = await answered.json() as { id: string, priced: { totalPence: number } }
    expect(body.id).toBeTruthy()
    expect(body.priced.totalPence).toBe(500)
  })

  test('no reason is refused', async () => {
    const { venueId, performanceId } = programme(`comps-noreason-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId)

    const answered = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: '' })
    expect(answered.status).toBe(400)
  })

  test('a duty manager or the bar manager decides; ordinary bar staff may not', async () => {
    const { venueId, performanceId } = programme(`comps-authority-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId)

    const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' })
    const { id } = await asked.json() as { id: string }

    const refused = await approve(id, barStaff.cookie)
    expect(refused.status).toBe(403)

    const accepted = await approve(id, barManager.cookie)
    expect(accepted.status).toBe(200)
  })

  test('a requester can never approve their own request', async () => {
    const { venueId, performanceId } = programme(`comps-self-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId, barManager.cookie)

    const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' }, barManager.cookie)
    const { id } = await asked.json() as { id: string }

    const answered = await approve(id, barManager.cookie)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('own request')
  })

  test('a requester can never decline their own request either', async () => {
    const { venueId, performanceId } = programme(`comps-self-decline-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId, barManager.cookie)

    const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' }, barManager.cookie)
    const { id } = await asked.json() as { id: string }

    const answered = await decline(id, 'Changed my mind', barManager.cookie)
    expect(answered.status).toBe(409)
  })
})

describe.skipIf(skip !== null)('approval is claimed atomically (criterion 2)', () => {
  test('two approvals racing the same request settle to one decision', async () => {
    const { venueId, performanceId } = programme(`comps-race-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId)
    confirmShift(performanceId, 'DUTY_MANAGER', barManager.id)

    const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' })
    const { id } = await asked.json() as { id: string }

    const [first, second] = await Promise.all([approve(id, barManager.cookie), approve(id, officer.cookie)])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
  })

  test('a declined request cannot then be approved', async () => {
    const { venueId, performanceId } = programme(`comps-decline-then-approve-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId)
    confirmShift(performanceId, 'DUTY_MANAGER', barManager.id)

    const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' })
    const { id } = await asked.json() as { id: string }

    expect((await decline(id, 'Not tonight', barManager.cookie)).status).toBe(200)
    const second = await approve(id, barManager.cookie)
    expect(second.status).toBe(409)
    expect(await message(second)).toContain('already been decided')
  })
})

describe.skipIf(skip !== null)('a comp sale writes a zero-value payment with full-price lines snapshotted (criterion 4)', () => {
  test('the entry is COMP, zero total, and the line keeps the retail price', async () => {
    const { id, venueId } = await approvedRequest(500)

    const answered = await give(id, venueId, 500)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { entryId: string, comp: { foregonePence: number } }
    expect(body.comp.foregonePence).toBe(500)

    const entry = latestLedgerEntry()
    expect(entry).toMatchObject({ tender: 'COMP', total_pence: 0, comp_approved_by: barManager.id })
    expect(entry?.comp_reason).toBe('A round on the house')

    const lines = linesFor(body.entryId)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ amount_pence: 0, unit_price_pence: 500, qty: 1 })
  })

  test('stock depletes exactly as a paid sale', async () => {
    const { venueId, performanceId } = programme(`comps-stock-${crypto.randomUUID().slice(0, 6)}`)
    const category = await aCategory()
    const itemAnswered = await send('POST', '/api/admin/bar/items', { name: named('Gin'), unit: 'ML', containerMl: 700 })
    const { id: itemId } = await itemAnswered.json() as { id: string }
    await send('POST', '/api/admin/bar/movements', { itemId, qty: 700, kind: 'DELIVERY' })

    const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId: category })
    const { id: productId } = await productAnswered.json() as { id: string }
    const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
    const { id: variantId } = await variantAnswered.json() as { id: string }
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 50 }] })
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 500, effectiveFrom: today })
    await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })

    await openTill(venueId, performanceId)
    confirmShift(performanceId, 'DUTY_MANAGER', barManager.id)
    const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' })
    const { id } = await asked.json() as { id: string }
    await approve(id, barManager.cookie)

    const before = new Database(app.databaseFile, { readonly: true })
    const onHandBefore = (before.query('SELECT coalesce(sum(qty), 0) AS n FROM stock_movements WHERE item_id = ?').get(itemId) as { n: number }).n
    before.close()

    expect((await give(id, venueId, 500)).status).toBe(200)

    const after = new Database(app.databaseFile, { readonly: true })
    const onHandAfter = (after.query('SELECT coalesce(sum(qty), 0) AS n FROM stock_movements WHERE item_id = ?').get(itemId) as { n: number }).n
    after.close()
    expect(onHandAfter).toBe(onHandBefore - 50)
  })

  test('the basket given is the one approved, not whatever the till last held', async () => {
    const { id, venueId } = await approvedRequest(500)
    // The give route takes no basket at all: only a request id and the screen's own belief of the
    // total, so there is nothing for a till to substitute (F-110 criteria 2, 4).
    const mismatched = await give(id, venueId, 999)
    expect(mismatched.status).toBe(409)
    expect(await message(mismatched)).toContain('£9.99')
  })
})

describe.skipIf(skip !== null)('an approved comp cannot be given twice (criterion 2, extended to the spend)', () => {
  test('a second attempt to give the same comp is refused', async () => {
    const { id, venueId } = await approvedRequest(500)
    expect((await give(id, venueId, 500)).status).toBe(200)
    const second = await give(id, venueId, 500)
    expect(second.status).toBe(409)
  })

  test('a pending or declined request cannot be given', async () => {
    const { venueId, performanceId } = programme(`comps-not-approved-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId)
    confirmShift(performanceId, 'DUTY_MANAGER', barManager.id)

    const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' })
    const { id } = await asked.json() as { id: string }

    const pending = await give(id, venueId, 500)
    expect(pending.status).toBe(409)

    await decline(id, 'Not tonight', barManager.cookie)
    const declined = await give(id, venueId, 500)
    expect(declined.status).toBe(409)
  })
})

describe.skipIf(skip !== null)('a restricted line still needs a Challenge 25 outcome on a comp (safety survives a zero price)', () => {
  test('a restricted line with no outcome is refused', async () => {
    const { venueId, performanceId } = programme(`comps-agecheck-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500, true)
    await openTill(venueId, performanceId)
    confirmShift(performanceId, 'DUTY_MANAGER', barManager.id)

    const asked = await ask({ venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' })
    const { id } = await asked.json() as { id: string }
    await approve(id, barManager.cookie)

    const answered = await give(id, venueId, 500)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('Challenge 25')
  })
})
