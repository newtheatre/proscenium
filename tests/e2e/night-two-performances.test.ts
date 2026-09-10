import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-127 criterion 6, end to end: a matinee and an evening at one venue produce two rotas, two
// registers and two reports, sharing one bar session.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

function withBatch<T>(fn: (runner: { batch: (statements: [string, ...unknown[]][]) => void }) => T): T {
  const database = new Database(app.databaseFile)
  try {
    return fn({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    })
  }
  finally {
    database.close()
  }
}

function shift(performanceId: string, role: string, userId: string, slot = 1): void {
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
    `${performanceId}-${role}-${slot}`, performanceId, role, slot, userId, 'CONFIRMED')
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

const created = async (answered: Response): Promise<string> => {
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

async function aSellableVariant(): Promise<string> {
  const categoryId = await created(await send('POST', '/api/admin/bar/categories', { name: named('Spirits') }))
  const productId = await created(await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId }))
  const variantId = await created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' }))
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 250, effectiveFrom: today() })
  await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
  return variantId
}

describe.skipIf(skip !== null)('a matinee and an evening at one venue, end to end (E-127 criterion 6)', () => {
  test('two rotas, two registers, two reports, one bar session', async () => {
    const dm = await registerMember(app, 'two-perf-dm', generatePassword())
    const bar = await registerMember(app, 'two-perf-bar', generatePassword())

    const { venueId, matineeId, eveningId } = withBatch((runner) => {
      const venueId = testVenue(runner, { suffix: 'two-performances' }).id
      const matineeId = tonightsPerformance(runner, { suffix: 'two-perf-matinee', venueId, curtainHoursAfterNightStart: 10 }).performanceId
      const eveningId = tonightsPerformance(runner, { suffix: 'two-perf-evening', venueId, curtainHoursAfterNightStart: 15.5 }).performanceId
      return { venueId, matineeId, eveningId }
    })

    // Criterion 1: the same person holds shifts on both performances of the day.
    shift(matineeId, 'DUTY_MANAGER', dm.id)
    shift(eveningId, 'DUTY_MANAGER', dm.id)
    shift(matineeId, 'BAR', bar.id)
    shift(eveningId, 'BAR', bar.id)

    // Two registers: an age check against each performance.
    write(`INSERT INTO age_checks (id, performance_id, checked_by, outcome, id_type, description)
           VALUES (?, ?, ?, 'ACCEPTED', 'PASSPORT', 'Matinee patron')`, 'two-perf-age-matinee', matineeId, dm.id)
    write(`INSERT INTO age_checks (id, performance_id, checked_by, outcome, id_type, description)
           VALUES (?, ?, ?, 'ACCEPTED', 'PASSPORT', 'Evening patron')`, 'two-perf-age-evening', eveningId, dm.id)

    // One bar session, spanning the day (criterion 5): opening it once covers both performances.
    const openedFirst = await (await send('POST', '/api/till', { venueId }, bar.cookie)).json() as { opened: boolean, session: { id: string } }
    expect(openedFirst.opened).toBe(true)
    const openedAgain = await (await send('POST', '/api/till', { venueId }, bar.cookie)).json() as { opened: boolean, session: { id: string } }
    expect(openedAgain.opened).toBe(false)
    expect(openedAgain.session.id).toBe(openedFirst.session.id)

    // A sale named to the matinee lands there and only there: the server already supports this,
    // even though the till screen has no picker to choose it yet (docs/known-issues.md).
    const variantId = await aSellableVariant()
    const sale = await send('POST', '/api/till/sale', {
      venueId, performanceId: matineeId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250,
    }, bar.cookie)
    expect(sale.status).toBe(200)

    // Two reports, independently: the matinee's age check and bar sale never cross into the
    // evening's (criterion 4's "own report" half; its checklist half awaits a decision).
    const matineeReport = await (await send('GET', `/api/tonight/report?performanceId=${matineeId}`, undefined, dm.cookie)).json() as {
      performanceId: string
      ageChecks: { accepted: number }
      bar: { revenuePence: number, itemsSold: number }
      staffing: { role: string, name: string | null }[]
    }
    const eveningReport = await (await send('GET', `/api/tonight/report?performanceId=${eveningId}`, undefined, dm.cookie)).json() as {
      performanceId: string
      ageChecks: { accepted: number }
      bar: { revenuePence: number, itemsSold: number }
      staffing: { role: string, name: string | null }[]
    }

    expect(matineeReport.performanceId).toBe(matineeId)
    expect(matineeReport.ageChecks).toMatchObject({ accepted: 1 })
    expect(matineeReport.bar).toMatchObject({ revenuePence: 250, itemsSold: 1 })
    expect(matineeReport.staffing.find(row => row.role === 'DUTY_MANAGER')?.name).toBe(dm.name)

    expect(eveningReport.performanceId).toBe(eveningId)
    expect(eveningReport.ageChecks).toMatchObject({ accepted: 1 })
    expect(eveningReport.bar).toMatchObject({ revenuePence: 0, itemsSold: 0 })
    expect(eveningReport.staffing.find(row => row.role === 'DUTY_MANAGER')?.name).toBe(dm.name)
  })
})
