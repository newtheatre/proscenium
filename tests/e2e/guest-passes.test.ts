import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, grantRole, registerMember } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-138 through the real routes: a pass with no account behind it, remembered by the browser
// that opened it (0259).

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

async function coveredPerformance(): Promise<{ performanceId: string, passTypeId: string, priceId: string }> {
  const title = `Uncle Vanya ${unique()}`
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: now + 7 * 86_400, durationMinutes: 120 })
  const performanceId = (await performance.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  const name = `Season pass ${unique()}`
  const body = { name, slug: slugged(name), validFrom: now, validUntil: now + 180 * 86_400, prices: [{ label: 'Standard', price: 4500 }] }
  const created = await send('POST', '/api/admin/pass-types', { ...body, showIds: [showId] })
  const { id: passTypeId } = await created.json() as { id: string }
  await send('PUT', `/api/admin/pass-types/${passTypeId}`, { ...body, status: 'ON_SALE' })
  const detail = await send('GET', `/api/admin/pass-types/${passTypeId}`)
  const { passType } = await detail.json() as { passType: { prices: { id: string }[] } }
  return { performanceId, passTypeId, priceId: passType.prices[0]!.id }
}

async function guestPass(passTypeId: string, priceId: string, email = `guest-${unique()}@example.invalid`): Promise<{ passId: string, qrToken: string, email: string }> {
  const issued = await send('POST', '/api/box-office/desk/passes', {
    passTypeId, passTypePriceId: priceId, guest: { name: 'Gwen Guest', email }, expectedTotalPence: 4500,
  }, boxOffice.cookie)
  expect(issued.status).toBe(200)
  const { passId, qrToken } = await issued.json() as { passId: string, qrToken: string }
  return { passId, qrToken, email }
}

// The cookie the browser keeps after opening the pass link, as a request header.
async function opened(qrToken: string, already = ''): Promise<{ cookie: string, header: string }> {
  const response = await send('GET', `/passes/${qrToken}`, undefined, already || null)
  expect(response.status).toBe(302)
  const header = response.headers.get('set-cookie') ?? ''
  return { cookie: header.split(';')[0]!, header }
}

describe.skipIf(skip !== null)('the desk issues a pass to a name and an email (criterion 1)', () => {
  test('a new address becomes a guest record holding the pass, and the pass is emailed to it', async () => {
    const { passTypeId, priceId } = await coveredPerformance()
    const { passId, email } = await guestPass(passTypeId, priceId)

    const [holder] = query<{ id: string, name: string, password: string | null }>(
      'SELECT u.id, u.name, u.password FROM passes p JOIN users u ON u.id = p.user_id WHERE p.id = ?', passId)
    expect(holder).toMatchObject({ name: 'Gwen Guest', password: null })
    expect(query<{ email: string }>('SELECT email FROM users WHERE id = ?', holder!.id)[0]?.email).toBe(email)
    expect(query(`SELECT id FROM notification_log WHERE type = 'pass.issued' AND user_id = ?`, holder!.id)).toHaveLength(1)
  }, CASE_TIMEOUT_MS)

  test('a person and a new buyer together, or neither, is refused', async () => {
    const { passTypeId, priceId } = await coveredPerformance()
    const both = await send('POST', '/api/box-office/desk/passes', {
      passTypeId, passTypePriceId: priceId, userId: boxOffice.id, guest: { name: 'Gwen', email: `g-${unique()}@example.invalid` }, expectedTotalPence: 4500,
    }, boxOffice.cookie)
    expect(both.status).toBe(400)
    const neither = await send('POST', '/api/box-office/desk/passes', { passTypeId, passTypePriceId: priceId, expectedTotalPence: 4500 }, boxOffice.cookie)
    expect(neither.status).toBe(400)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the browser that opens the pass remembers it (criteria 2, 3)', () => {
  test('opening the link keeps the pass for longer than a day, out of reach of page scripts', async () => {
    const { passTypeId, priceId } = await coveredPerformance()
    const { qrToken } = await guestPass(passTypeId, priceId)
    const { header } = await opened(qrToken)
    expect(header).toContain('nnt-passes=')
    expect(header).toContain('HttpOnly')
    expect(Number(/Max-Age=(\d+)/i.exec(header)?.[1])).toBeGreaterThan(86_400)
  }, CASE_TIMEOUT_MS)

  test('a signed-out visitor with the pass remembered is offered it, and one without is not', async () => {
    const { performanceId, passTypeId, priceId } = await coveredPerformance()
    const { passId, qrToken } = await guestPass(passTypeId, priceId)
    const { cookie } = await opened(qrToken)

    const remembered = await send('GET', `/api/performances/${performanceId}/booking`, undefined, cookie)
    expect((await remembered.json() as { redeemablePass: { id: string } | null }).redeemablePass?.id).toBe(passId)

    const stranger = await send('GET', `/api/performances/${performanceId}/booking`, undefined, null)
    expect((await stranger.json() as { redeemablePass: unknown }).redeemablePass).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('redeeming with the cookie makes a zero-value booking on the pass\'s own record', async () => {
    const { performanceId, passTypeId, priceId } = await coveredPerformance()
    const { passId, qrToken } = await guestPass(passTypeId, priceId)
    const { cookie } = await opened(qrToken)

    const refused = await send('POST', `/api/passes/${passId}/redeem`, { performanceId }, null)
    expect(refused.status).toBe(404)

    const redeemed = await send('POST', `/api/passes/${passId}/redeem`, { performanceId }, cookie)
    expect(redeemed.status).toBe(200)
    expect((await redeemed.json() as { totalPence: number }).totalPence).toBe(0)

    const [booking] = query<{ bookerId: string, holderId: string }>(
      `SELECT r.user_id AS bookerId, p.user_id AS holderId FROM pass_admissions a
       JOIN tickets t ON t.id = a.ticket_id JOIN reservations r ON r.id = t.reservation_id
       JOIN passes p ON p.id = a.pass_id WHERE a.pass_id = ? AND a.performance_id = ?`, passId, performanceId)
    expect(booking?.bookerId).toBe(booking!.holderId)

    const after = await send('GET', `/api/performances/${performanceId}/booking`, undefined, cookie)
    expect((await after.json() as { usedPass: { reference: string } | null }).usedPass).not.toBeNull()
  }, CASE_TIMEOUT_MS)

  test('a cookie naming one pass does not spend another', async () => {
    const { performanceId, passTypeId, priceId } = await coveredPerformance()
    const mine = await guestPass(passTypeId, priceId)
    const theirs = await guestPass(passTypeId, priceId)
    const { cookie } = await opened(mine.qrToken)
    const refused = await send('POST', `/api/passes/${theirs.passId}/redeem`, { performanceId }, cookie)
    expect(refused.status).toBe(404)
  }, CASE_TIMEOUT_MS)

  test('a second pass opened in the same browser is remembered beside the first', async () => {
    const one = await coveredPerformance()
    const two = await coveredPerformance()
    const first = await guestPass(one.passTypeId, one.priceId)
    const second = await guestPass(two.passTypeId, two.priceId)
    const { cookie: afterFirst } = await opened(first.qrToken)
    const { cookie: afterBoth } = await opened(second.qrToken, afterFirst)

    const offeredOne = await send('GET', `/api/performances/${one.performanceId}/booking`, undefined, afterBoth)
    expect((await offeredOne.json() as { redeemablePass: { id: string } | null }).redeemablePass?.id).toBe(first.passId)
    const offeredTwo = await send('GET', `/api/performances/${two.performanceId}/booking`, undefined, afterBoth)
    expect((await offeredTwo.json() as { redeemablePass: { id: string } | null }).redeemablePass?.id).toBe(second.passId)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a new device asks for the email again, and a browser can forget (criteria 4, 5)', () => {
  test('a known and an unknown address get the same answer, and only the known one is emailed', async () => {
    const { passTypeId, priceId } = await coveredPerformance()
    const { passId, email } = await guestPass(passTypeId, priceId)
    const holderId = query<{ userId: string }>('SELECT user_id AS userId FROM passes WHERE id = ?', passId)[0]!.userId

    const known = await send('POST', '/api/passes/resend', { email }, null)
    const unknown = await send('POST', '/api/passes/resend', { email: `nobody-${unique()}@example.invalid` }, null)
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(await known.json()).toEqual(await unknown.json())
    expect(query(`SELECT id FROM notification_log WHERE type = 'pass.issued' AND user_id = ?`, holderId)).toHaveLength(2)
  }, CASE_TIMEOUT_MS)

  test('forgetting clears the cookie, and the booking page stops offering the pass', async () => {
    const { performanceId, passTypeId, priceId } = await coveredPerformance()
    const { qrToken } = await guestPass(passTypeId, priceId)
    const { cookie } = await opened(qrToken)

    const forgot = await send('DELETE', '/api/passes/device', undefined, cookie)
    expect(forgot.status).toBe(200)
    const cleared = forgot.headers.get('set-cookie') ?? ''
    expect(cleared).toMatch(/nnt-passes=;|Max-Age=0/i)

    const after = await send('GET', `/api/performances/${performanceId}/booking`, undefined, null)
    expect((await after.json() as { redeemablePass: unknown }).redeemablePass).toBeNull()
  }, CASE_TIMEOUT_MS)
})
