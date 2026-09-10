import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-125 through the real routes. The named races are proven directly against a scratch database
// in tests/integration/races-pass-redemption.test.ts; this confirms the ordinary path end to end.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)

  boxOffice = await registerMember(app, 'boxoffice', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, officer.cookie)

  venueId = venue()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(as ? { cookie: as } : {}) },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function venue(capacity: number | null = 120): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: crypto.randomUUID().slice(0, 8), capacity }).id
  }
  finally {
    database.close()
  }
}

function query<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (offsetHours = 0): number => Math.floor(Date.now() / 1000) + 7 * 86_400 + offsetHours * 3600
const now = Math.floor(Date.now() / 1000)

// A published, on-sale performance and a pass product covering it, ready for a member to hold a
// pass against (criterion 1). `capacity` lets the capacity-refusal case start from a full house.
async function coveredPerformance(capacity: number | null = 120): Promise<{ performanceId: string, passTypeId: string, priceId: string }> {
  const showVenue = capacity === 120 ? venueId : venue(capacity)
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId: showVenue, startsAt: nextWeek() })
  const performanceId = (await performance.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  const name = named('Season pass')
  const created = await send('POST', '/api/admin/pass-types', {
    name, slug: slugged(name), validFrom: now, validUntil: now + 180 * 86_400,
    prices: [{ label: 'Standard', price: 4500 }], showIds: [showId],
  })
  const { id: passTypeId } = await created.json() as { id: string }
  await send('PUT', `/api/admin/pass-types/${passTypeId}`, {
    name, slug: slugged(name), validFrom: now, validUntil: now + 180 * 86_400,
    prices: [{ label: 'Standard', price: 4500 }], status: 'ON_SALE', showIds: [showId],
  })
  const detail = await send('GET', `/api/admin/pass-types/${passTypeId}`)
  const { passType } = await detail.json() as { passType: { prices: { id: string }[] } }

  return { performanceId, passTypeId, priceId: passType.prices[0]!.id }
}

async function holderWithPass(passTypeId: string, priceId: string): Promise<{ holder: TestMember, passId: string }> {
  const holder = await registerMember(app, 'holder', generatePassword())
  const issued = await send('POST', '/api/box-office/desk/passes', {
    passTypeId, passTypePriceId: priceId, userId: holder.id, expectedTotalPence: 4500,
  }, boxOffice.cookie)
  expect(issued.status).toBe(200)
  const { passId } = await issued.json() as { passId: string }
  return { holder, passId }
}

describe.skipIf(skip !== null)('a covered pass is offered and redeems while reserving (criteria 1, 2, 4, 5)', () => {
  test('an eligible pass is offered, redeems as a zero-value admission, and posts a zero-value ledger line', async () => {
    const { performanceId, passTypeId, priceId } = await coveredPerformance()
    const { holder, passId } = await holderWithPass(passTypeId, priceId)

    const before = await send('GET', `/api/performances/${performanceId}/booking`, undefined, holder.cookie)
    const { redeemablePass } = await before.json() as { redeemablePass: { id: string } | null }
    expect(redeemablePass?.id).toBe(passId)

    const redeemed = await send('POST', `/api/passes/${passId}/redeem`, { performanceId }, holder.cookie)
    expect(redeemed.status).toBe(200)
    const { reference, totalPence, qrToken } = await redeemed.json() as { reference: string, totalPence: number, qrToken: string }
    expect(reference).toHaveLength(6)
    expect(totalPence).toBe(0)
    expect(qrToken).toBeTruthy()

    const ticket = query<{ pricePaid: number }>(
      `SELECT t.price_paid AS pricePaid FROM tickets t
       JOIN pass_admissions a ON a.ticket_id = t.id
       WHERE a.pass_id = ? AND a.performance_id = ?`, passId, performanceId,
    )
    expect(ticket?.pricePaid).toBe(0)

    const line = query<{ kind: string, amountPence: number, performanceId: string | null }>(
      'SELECT kind AS kind, amount_pence AS amountPence, performance_id AS performanceId FROM ledger_lines WHERE price_ref = ?', passId,
    )
    expect(line).toEqual({ kind: 'PASS_ADMISSION', amountPence: 0, performanceId })

    const entry = query<{ source: string, tender: string }>(
      `SELECT e.source AS source, e.tender AS tender FROM ledger_entries e
       JOIN ledger_lines l ON l.entry_id = e.id WHERE l.price_ref = ?`, passId,
    )
    expect(entry).toEqual({ source: 'SELF_SERVE', tender: 'NONE' })

    // Not offered again: the once-per-performance rule (criterion 2) reads live.
    const after = await send('GET', `/api/performances/${performanceId}/booking`, undefined, holder.cookie)
    expect((await after.json() as { redeemablePass: unknown }).redeemablePass).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('a second redemption of the same pass for the same performance is refused', async () => {
    const { performanceId, passTypeId, priceId } = await coveredPerformance()
    const { holder, passId } = await holderWithPass(passTypeId, priceId)

    expect((await send('POST', `/api/passes/${passId}/redeem`, { performanceId }, holder.cookie)).status).toBe(200)
    const again = await send('POST', `/api/passes/${passId}/redeem`, { performanceId }, holder.cookie)
    expect(again.status).toBe(409)
    expect(await again.text()).toContain('already been redeemed')

    const total = query<{ total: number }>(
      'SELECT count(*) AS total FROM pass_admissions WHERE pass_id = ? AND performance_id = ?', passId, performanceId,
    )
    expect(total?.total).toBe(1)
  }, CASE_TIMEOUT_MS)

  test('somebody else\'s pass answers as though it does not exist', async () => {
    const { performanceId, passTypeId, priceId } = await coveredPerformance()
    const { passId } = await holderWithPass(passTypeId, priceId)
    const stranger = await registerMember(app, 'stranger', generatePassword())

    const attempt = await send('POST', `/api/passes/${passId}/redeem`, { performanceId }, stranger.cookie)
    expect(attempt.status).toBe(404)
  }, CASE_TIMEOUT_MS)

  test('a pass for an uncovered show refuses, naming why', async () => {
    const { passTypeId, priceId } = await coveredPerformance()
    const { holder, passId } = await holderWithPass(passTypeId, priceId)
    const { performanceId: otherPerformanceId } = await coveredPerformance()

    const attempt = await send('POST', `/api/passes/${passId}/redeem`, { performanceId: otherPerformanceId }, holder.cookie)
    expect(attempt.status).toBe(409)
    expect(await attempt.text()).toContain('does not cover')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('capacity still applies in full (criterion 3)', () => {
  test('a full house refuses redemption, quoting the honest figure', async () => {
    const { performanceId, passTypeId, priceId } = await coveredPerformance(1)
    const { holder, passId } = await holderWithPass(passTypeId, priceId)

    const filler = await registerMember(app, 'filler', generatePassword())
    const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
    const ticketTypeId = (await type.json() as { id: string }).id
    const held = await send('POST', '/api/reservations', {
      performanceId, lines: [{ ticketTypeId, quantity: 1 }],
    }, filler.cookie)
    expect(held.status).toBe(200)

    const attempt = await send('POST', `/api/passes/${passId}/redeem`, { performanceId }, holder.cookie)
    expect(attempt.status).toBe(409)
    expect(await attempt.text()).toContain('sold out')

    const total = query<{ total: number }>('SELECT count(*) AS total FROM pass_admissions WHERE pass_id = ?', passId)
    expect(total?.total).toBe(0)
  }, CASE_TIMEOUT_MS)
})
