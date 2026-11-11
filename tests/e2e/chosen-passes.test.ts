import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, grantRole, registerMember } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-139 and D-140 through the real routes (0261): a pass chosen while booking is unpaid, holds
// its seat, holds no place under the cap and admits nobody until the till takes its price.

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
  await grantRole(app, boxOffice, 'FOH_MANAGER', officer.cookie)
  venueId = venue()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as: string | null = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(as ? { cookie: as } : {}) },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: crypto.randomUUID().slice(0, 8), capacity: 120 }).id
  }
  finally {
    database.close()
  }
}

function query<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
  }
  finally {
    database.close()
  }
}

const unique = (): string => crypto.randomUUID().slice(0, 8)
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const now = Math.floor(Date.now() / 1000)

async function coveredPerformance(maxIssued: number | null = null): Promise<{ performanceId: string, passTypeId: string, priceId: string }> {
  const title = `Uncle Vanya ${unique()}`
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: now + 7 * 86_400, durationMinutes: 120 })
  const performanceId = (await performance.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  const name = `Season pass ${unique()}`
  const body = { name, slug: slugged(name), validFrom: now, validUntil: now + 180 * 86_400, maxIssued, prices: [{ label: 'Standard', price: 4500 }] }
  const created = await send('POST', '/api/admin/pass-types', { ...body, showIds: [showId] })
  const { id: passTypeId } = await created.json() as { id: string }
  await send('PUT', `/api/admin/pass-types/${passTypeId}`, { ...body, status: 'ON_SALE' })
  const detail = await send('GET', `/api/admin/pass-types/${passTypeId}`)
  const { passType } = await detail.json() as { passType: { prices: { id: string }[] } }
  return { performanceId, passTypeId, priceId: passType.prices[0]!.id }
}

// A signed-out visitor chooses the pass on the booking page, as its form sends it.
async function choose(performanceId: string, priceId: string, email = `chooser-${unique()}@example.invalid`): Promise<{ response: Response, email: string }> {
  const response = await send('POST', '/api/passes/choose', { performanceId, passTypePriceId: priceId, guest: { name: 'Cleo Chooser', email } }, null)
  return { response, email }
}

interface ChosenRow { passId: string, paid: number, pricePaid: number, issuedBy: string | null, status: string, holdExpiresAt: number | null, userId: string }

function chosenFor(email: string): ChosenRow | undefined {
  return query<ChosenRow>(`
    SELECT p.id AS passId, p.paid AS paid, p.price_paid AS pricePaid, p.issued_by AS issuedBy, r.status AS status,
           r.hold_expires_at AS holdExpiresAt, p.user_id AS userId
    FROM passes p
    JOIN users u ON u.id = p.user_id
    JOIN pass_admissions a ON a.pass_id = p.id
    JOIN tickets k ON k.id = a.ticket_id
    JOIN reservations r ON r.id = k.reservation_id
    WHERE u.email = ?`, email)[0]
}

describe.skipIf(skip !== null)('choosing a pass while booking (D-139 criterion 1)', () => {
  test('a signed-out visitor gets an unpaid pass and a held seat on it, with nothing charged', async () => {
    const { performanceId, priceId } = await coveredPerformance()
    const { response, email } = await choose(performanceId, priceId)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ totalPence: 0, passTotalPence: 4500 })

    const chosen = chosenFor(email)
    expect(chosen).toMatchObject({ paid: 0, pricePaid: 4500, issuedBy: null, status: 'PENDING' })
    expect(chosen?.holdExpiresAt).not.toBeNull()
    expect(query(`SELECT id FROM ledger_lines WHERE kind = 'PASS_SALE' AND price_ref = ?`, chosen!.passId)).toHaveLength(0)
  }, CASE_TIMEOUT_MS)

  test('the browser remembers the chosen pass, and both emails go to the address', async () => {
    const { performanceId, priceId } = await coveredPerformance()
    const { response, email } = await choose(performanceId, priceId)
    expect(response.headers.get('set-cookie') ?? '').toContain('nnt-passes=')
    const userId = chosenFor(email)!.userId
    expect(query(`SELECT id FROM notification_log WHERE type = 'pass.issued' AND user_id = ?`, userId)).toHaveLength(1)
    expect(query(`SELECT id FROM notification_log WHERE type = 'reservation.confirmed' AND user_id = ?`, userId)).toHaveLength(1)
  }, CASE_TIMEOUT_MS)

  test('a second choice of the same pass on the same address is refused, and nothing more is written', async () => {
    const { performanceId, priceId } = await coveredPerformance()
    const { email } = await choose(performanceId, priceId)
    const again = await choose(performanceId, priceId, email)
    expect(again.response.status).toBe(409)
    expect(query('SELECT p.id FROM passes p JOIN users u ON u.id = p.user_id WHERE u.email = ?', email)).toHaveLength(1)
  }, CASE_TIMEOUT_MS)

  test('a price point of a pass that does not cover the show is refused', async () => {
    const { performanceId } = await coveredPerformance()
    const other = await coveredPerformance()
    const { response } = await choose(performanceId, other.priceId)
    expect(response.status).toBe(409)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('an unpaid pass holds no place under the cap (D-139 criterion 3)', () => {
  test('two visitors may choose a pass capped at one, since the cap is asserted at payment', async () => {
    const { performanceId, priceId } = await coveredPerformance(1)
    expect((await choose(performanceId, priceId)).response.status).toBe(200)
    expect((await choose(performanceId, priceId)).response.status).toBe(200)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a seat on an unpaid pass is paid for at the till, not collected (D-140)', () => {
  test('the desk refuses to collect it, quoting the pass\'s price', async () => {
    const { performanceId, priceId } = await coveredPerformance()
    const { email } = await choose(performanceId, priceId)
    const [booking] = query<{ id: string }>(`
      SELECT r.id FROM reservations r JOIN users u ON u.id = r.user_id WHERE u.email = ?`, email)
    const collect = await send('POST', `/api/box-office/desk/reservations/${booking!.id}/collect`, { expectedTotalPence: 0, tender: 'CARD' }, boxOffice.cookie)
    expect(collect.status).toBe(409)
    expect(await collect.text()).toContain('£45.00 is due at the till first')
  }, CASE_TIMEOUT_MS)

  test('the browser that chose it is told this night is already on the pass', async () => {
    const { performanceId, priceId } = await coveredPerformance()
    const { response } = await choose(performanceId, priceId)
    const cookie = response.headers.getSetCookie().map(one => one.split(';')[0]!).find(one => one.startsWith('nnt-passes='))!
    const booking = await send('GET', `/api/performances/${performanceId}/booking`, undefined, cookie)
    const { usedPass, redeemablePass } = await booking.json() as { usedPass: { reference: string } | null, redeemablePass: unknown }
    expect(usedPass).not.toBeNull()
    expect(redeemablePass).toBeNull()
  }, CASE_TIMEOUT_MS)
})
