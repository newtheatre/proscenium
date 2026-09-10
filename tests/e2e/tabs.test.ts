import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-108: a tab charge is credit extended to an authorised holder, capped, atomic, and structurally
// bar lines only, since the till this endpoint serves never creates any other kind.

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
  barManager = await registerMember(app, 'tab-bar-manager', barManagerPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
  barStaff = await registerMember(app, 'tab-bar-staff', barStaffPassword)
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

// A fresh holder per test: an outstanding tab balance is genuinely cumulative, so reusing one
// account across tests would leak a balance from an earlier case into this one.
const aMember = (): Promise<TestMember> => registerMember(app, 'tab-holder', generatePassword())

const setCap = (pence: number): Promise<Response> => send('PUT', '/api/admin/config/BAR_TAB_CAP_PENCE', { value: pence })
const setOverrideEnabled = (enabled: boolean): Promise<Response> => send('PUT', '/api/admin/config/BAR_TAB_CAP_MANAGER_OVERRIDE', { value: enabled })
const authorise = (userIds: string[]): Promise<Response> => send('PUT', '/api/admin/config/BAR_AUTHORISED_TAB_HOLDERS', { value: userIds })

function programme(suffix: string): { venueId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    return { venueId: made.venueId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

// Ordinary bar staff hold shift authority, not a standing role grant (0009): a confirmed shift is
// what `requireNightAuthority` actually reads.
let nextSlot = 100
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

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

// Ordinary bar staff need a confirmed shift before the till will open to them; the manager
// account needs nothing extra, since bar.write already satisfies the officer bypass.
function openTill(venueId: string, performanceId: string, as: string = barStaff.cookie): Promise<Response> {
  if (as === barStaff.cookie) confirmBarShift(performanceId, barStaff.id)
  return send('POST', '/api/till', { venueId }, as)
}
const aCategory = async (): Promise<string> => {
  const answered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

async function aSellableProduct(pricePence = 500): Promise<{ variantId: string }> {
  const categoryId = await aCategory()
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId })
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const { id: variantId } = await variantAnswered.json() as { id: string }
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today() })
  await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
  return { variantId }
}

const charge = (venueId: string, lines: unknown[], expectedTotalPence: number, tabHolderId: string | null, as = barStaff.cookie): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines, expectedTotalPence, tabHolderId }, as)

interface LedgerEntryRow { tender: string, tab_debtor_id: string | null, tab_settled_at: number | null, total_pence: number, actor_id: string }

function latestLedgerEntry(): LedgerEntryRow | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT * FROM ledger_entries ORDER BY rowid DESC LIMIT 1').get() as LedgerEntryRow | undefined
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a tab tender is offered only for authorised holders, checked live (criterion 1)', () => {
  test('an unauthorised member is refused', async () => {
    const { venueId, performanceId } = programme(`tabs-unauth-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([])

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 500, member.id)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('authorised')
  })

  test('an authorised member may be charged, and revoking takes effect on the very next charge', async () => {
    const { venueId, performanceId } = programme(`tabs-auth-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])

    const first = await charge(venueId, [{ variantId, qty: 1 }], 500, member.id)
    expect(first.status).toBe(200)
    const entry = latestLedgerEntry()
    expect(entry).toMatchObject({ tender: 'TAB', tab_debtor_id: member.id, tab_settled_at: null })

    await authorise([])
    const second = await charge(venueId, [{ variantId, qty: 1 }], 500, member.id)
    expect(second.status).toBe(409)
  })
})

describe.skipIf(skip !== null)('a cap applies per holder, refused quoting balance, charge and cap (criteria 3, 4)', () => {
  test('a charge within the cap succeeds, and the balance accumulates', async () => {
    const { venueId, performanceId } = programme(`tabs-within-cap-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await setCap(2000)

    expect((await charge(venueId, [{ variantId, qty: 1 }], 500, member.id)).status).toBe(200)
    const second = await charge(venueId, [{ variantId, qty: 1 }], 500, member.id)
    expect(second.status).toBe(200)
    const body = await second.json() as { tab: { outstandingPence: number } }
    expect(body.tab.outstandingPence).toBe(1000)
  })

  test('a charge that would breach the cap is refused, naming the balance, the charge and the cap', async () => {
    const { venueId, performanceId } = programme(`tabs-over-cap-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(2000)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await setCap(1000)

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 2000, member.id)
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain('£0.00')
    expect(refusal).toContain('£20.00')
    expect(refusal).toContain('£10.00')
  })

  test('ordinary bar staff cannot wave a charge past the cap themselves', async () => {
    const { venueId, performanceId } = programme(`tabs-no-override-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(2000)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await setCap(1000)

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 2000, member.id, barStaff.cookie)
    expect(answered.status).toBe(409)
  })

  test('a bar manager may override, and the entry attributes to them', async () => {
    const { venueId, performanceId } = programme(`tabs-manager-override-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(2000)
    await openTill(venueId, performanceId, barManager.cookie)
    const member = await aMember()
    await authorise([member.id])
    await setCap(1000)
    await setOverrideEnabled(true)

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 2000, member.id, barManager.cookie)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { tab: { capOverridden: boolean } }
    expect(body.tab.capOverridden).toBe(true)
    expect(latestLedgerEntry()?.actor_id).toBe(barManager.id)
  })

  test('an override is refused outright when the setting disallows it, even for a manager', async () => {
    const { venueId, performanceId } = programme(`tabs-override-disabled-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(2000)
    await openTill(venueId, performanceId, barManager.cookie)
    const member = await aMember()
    await authorise([member.id])
    await setCap(1000)
    await setOverrideEnabled(false)

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 2000, member.id, barManager.cookie)
    expect(answered.status).toBe(409)
    await setOverrideEnabled(true)
  })
})

describe.skipIf(skip !== null)('a tab charge is credit extended, not money taken, written atomically (criterion 5)', () => {
  test('the entry is marked TAB, not CARD, and lines and stock commit with it', async () => {
    const { venueId, performanceId } = programme(`tabs-atomic-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await setCap(2000)

    const database = new Database(app.databaseFile, { readonly: true })
    let counted: { entriesBefore: number, linesBefore: number }
    try {
      counted = {
        entriesBefore: (database.query('SELECT count(*) AS n FROM ledger_entries').get() as { n: number }).n,
        linesBefore: (database.query('SELECT count(*) AS n FROM ledger_lines').get() as { n: number }).n,
      }
    }
    finally {
      database.close()
    }
    const { entriesBefore, linesBefore } = counted

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 500, member.id)
    expect(answered.status).toBe(200)

    const after = new Database(app.databaseFile, { readonly: true })
    try {
      expect((after.query('SELECT count(*) AS n FROM ledger_entries').get() as { n: number }).n).toBe(entriesBefore + 1)
      expect((after.query('SELECT count(*) AS n FROM ledger_lines').get() as { n: number }).n).toBe(linesBefore + 1)
    }
    finally {
      after.close()
    }

    const entry = latestLedgerEntry()
    expect(entry?.tender).toBe('TAB')
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('picking a tab holder charges credit, not the reader, and the confirmation names the balance', async () => {
    const { venueId, performanceId } = programme(`tabs-screen-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    await openTill(venueId, performanceId)
    const member = await aMember()
    await authorise([member.id])
    await setCap(2000)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barStaff.email)
    await fill(view, 'form input[type="password"]', barStaffPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${variantId}"]`)
    await click(view, `[data-test="variant-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="tab-holder-${member.id}"]')`)
    await click(view, `[data-test="tab-holder-${member.id}"]`)
    await waitFor(view, `document.querySelector('[aria-label^="Put"]')`)

    await click(view, `[aria-label^="Put"]`)
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, '[data-test="tab-balance-note"]')).toContain('£5.00')
    view.close()
  }, 120_000)
})
