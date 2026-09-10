import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-126 through the real routes. The check-in race is pinned directly against a scratch database
// in tests/integration/races-door-admission.test.ts; this confirms the door screen's own path.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let admin: TestMember
let door: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  door = await registerMember(app, 'door-officer', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: door.id, role: 'FOH_MANAGER' }, admin.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = door.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function query<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

// A show running tonight, and a pass covering it held by `holder`, written directly (the
// admin/desk flow is proven end to end by tests/e2e/pass-redemption.test.ts already).
async function houseWithPass(): Promise<{ performanceId: string, passId: string, reference: string, holder: TestMember }> {
  const suffix = crypto.randomUUID().slice(0, 8)
  const database = new Database(app.databaseFile)
  let performanceId: string, showId: string
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    performanceId = made.performanceId
    showId = made.showId
  }
  finally {
    database.close()
  }

  const holder = await registerMember(app, 'holder', generatePassword())
  const now = Math.floor(Date.now() / 1000)
  const passTypeId = `pt-${suffix}`
  const passId = `pass-${suffix}`
  const reference = suffix.toUpperCase().slice(0, 6)

  write('INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?)',
    passTypeId, passTypeId, `Pass ${suffix}`, now - 1_000, now + 1_000, 'ON_SALE')
  write('INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', `${passTypeId}-price`, passTypeId, 'Standard')
  write('INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', `${passTypeId}-show`, passTypeId, showId)
  write(`INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by)
         VALUES (?, ?, ?, ?, ?, 0, 'ACTIVE', ?)`, passId, reference, passTypeId, `${passTypeId}-price`, holder.id, holder.id)

  return { performanceId, passId, reference, holder }
}

describe.skipIf(skip !== null)('scanning an unredeemed pass admits it on the spot (criterion 1)', () => {
  test('a valid, unredeemed pass redeems and admits in the same gesture, recorded as source DOOR', async () => {
    const { performanceId, passId, reference } = await houseWithPass()

    const scanned = await send('POST', '/api/tonight/door/passes/scan', { reference, performanceId })
    expect(scanned.status).toBe(200)
    const { decision } = await scanned.json() as { decision: string }
    expect(decision).toBe('ADMIT')

    const reservation = query<{ status: string, source: string }>(
      `SELECT r.status AS status, r.source AS source FROM reservations r
       JOIN tickets t ON t.reservation_id = r.id
       JOIN pass_admissions a ON a.ticket_id = t.id
       WHERE a.pass_id = ?`, passId,
    )
    expect(reservation).toEqual({ status: 'DOOR', source: 'DOOR' })
  }, CASE_TIMEOUT_MS)

  test('a second scan of the same pass is refused as already admitted', async () => {
    const { performanceId, reference } = await houseWithPass()

    expect((await send('POST', '/api/tonight/door/passes/scan', { reference, performanceId })).status).toBe(200)
    const again = await send('POST', '/api/tonight/door/passes/scan', { reference, performanceId })
    expect(again.status).toBe(409)
    expect(await again.text()).toContain('already been admitted')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('scanning a pass already redeemed online admits in one gesture (criterion 1)', () => {
  test('a pass redeemed self-serve is admitted at the door with no second seat spent', async () => {
    const { performanceId, reference, holder } = await houseWithPass()

    // The self-serve route takes a pass id, not a reference; resolve it as the holder's own screen would.
    const passRow = query<{ id: string }>('SELECT id FROM passes WHERE reference = ?', reference)!
    const selfServe = await send('POST', `/api/passes/${passRow.id}/redeem`, { performanceId }, holder.cookie)
    expect(selfServe.status).toBe(200)

    const scanned = await send('POST', '/api/tonight/door/passes/scan', { reference, performanceId })
    expect(scanned.status).toBe(200)

    const total = query<{ total: number }>(
      `SELECT count(*) AS total FROM tickets t JOIN pass_admissions a ON a.ticket_id = t.id WHERE a.pass_id = ?`, passRow.id,
    )
    expect(total?.total).toBe(1)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('an invalid pass is refused loudly and specifically (criterion 2)', () => {
  test('an unknown reference answers as though no such pass', async () => {
    const { performanceId } = await houseWithPass()
    const answered = await send('POST', '/api/tonight/door/passes/scan', { reference: 'ZZZZZZ', performanceId })
    expect(answered.status).toBe(404)
  }, CASE_TIMEOUT_MS)

  test('a pass outside its validity window is refused, naming why', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const database = new Database(app.databaseFile)
    let performanceId: string, showId: string
    try {
      const made = tonightsPerformance(sqliteTarget(database), { suffix })
      performanceId = made.performanceId
      showId = made.showId
    }
    finally {
      database.close()
    }
    const holder = await registerMember(app, 'lapsed', generatePassword())
    const now = Math.floor(Date.now() / 1000)
    const passTypeId = `pt-lapsed-${suffix}`
    const reference = `LAPS${suffix.toUpperCase().slice(0, 2)}`
    write('INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?)',
      passTypeId, passTypeId, `Lapsed ${suffix}`, now - 10_000, now - 1_000, 'ON_SALE')
    write('INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', `${passTypeId}-price`, passTypeId, 'Standard')
    write('INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', `${passTypeId}-show`, passTypeId, showId)
    write(`INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by)
           VALUES (?, ?, ?, ?, ?, 0, 'ACTIVE', ?)`, `pass-lapsed-${suffix}`, reference, passTypeId, `${passTypeId}-price`, holder.id, holder.id)

    const answered = await send('POST', '/api/tonight/door/passes/scan', { reference, performanceId })
    expect(answered.status).toBe(409)
    expect(await answered.text()).toContain('expired')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the door role, and nobody else (0009)', () => {
  test('a signed-in member with no night authority is refused', async () => {
    const { performanceId, reference } = await houseWithPass()
    const stranger = await registerMember(app, 'stranger', generatePassword())
    const answered = await send('POST', '/api/tonight/door/passes/scan', { reference, performanceId }, stranger.cookie)
    expect(answered.status).toBe(403)
  }, CASE_TIMEOUT_MS)
})
