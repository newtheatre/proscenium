import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { sellOnTheTill } from '#tests/helpers/till'
import { skipReason, startApp } from '#tests/helpers/webview'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-127 criterion 6, end to end: a matinee and an evening at one venue produce two rotas, two
// registers and two reports, sharing one bar session; F-126 criterion 3 splits its sales by house.

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
    const sale = await sellOnTheTill(app.baseURL, {
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

// A placement is a bar window exactly, because the venue's BAR template sets both offsets to nought.
interface Placement { doorsAt: number, startsAt: number, durationMinutes: number }

const HOUR = 3600
const SLACK = 20 * 60

// There is no clock to set, so the houses move around the real now: the one that should take the
// sale spans it, the other sits an hour off on whichever side of now tonight has room (0014).
function housesAround(now: number, winner: 'matinee' | 'evening'): { matinee: Placement, evening: Placement } {
  const { from, to } = showNightBounds(currentShowNight())
  const side = to.getTime() / 1000 - now >= now - from.getTime() / 1000 ? 1 : -1
  const otherStartsAt = now + side * HOUR
  const other: Placement = { doorsAt: otherStartsAt, startsAt: otherStartsAt, durationMinutes: 30 }

  // The matinee is the earlier curtain whichever house wins, so the winner jumps the other if needed.
  const inOrder = (winner === 'matinee') === (side === 1)
  const startsAt = inOrder ? now : now + 2 * side * HOUR
  const endsAt = Math.max(startsAt, now) + SLACK
  const won: Placement = { doorsAt: Math.min(startsAt, now) - SLACK, startsAt, durationMinutes: (endsAt - startsAt) / 60 }

  return winner === 'matinee' ? { matinee: won, evening: other } : { matinee: other, evening: won }
}

function place(performanceId: string, placement: Placement): void {
  write('UPDATE performances SET doors_at = ?, starts_at = ?, duration_minutes = ? WHERE id = ?',
    placement.doorsAt, placement.startsAt, placement.durationMinutes, performanceId)
}

function placeHouses(ids: { matineeId: string, eveningId: string }, winner: 'matinee' | 'evening'): void {
  const placed = housesAround(Math.floor(Date.now() / 1000), winner)
  place(ids.matineeId, placed.matinee)
  place(ids.eveningId, placed.evening)
}

// The case takes seconds; begun in the night's last two minutes it waits for 04:00 instead, so the
// till, both houses and both sales share one night.
async function aNightWithRoom(): Promise<void> {
  const left = showNightBounds(currentShowNight()).to.getTime() - Date.now()
  if (left < 120_000) await Bun.sleep(left + 1_000)
}

function barLinesOf(entryId: string): { performance_id: string | null, till_session_id: string | null }[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(`SELECT l.performance_id, e.till_session_id FROM ledger_lines l
                           JOIN ledger_entries e ON e.id = l.entry_id
                           WHERE l.entry_id = ? AND l.kind = 'BAR_ITEM'`).all(entryId) as { performance_id: string | null, till_session_id: string | null }[]
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('two sales in one till session land on different houses (F-126 criterion 3)', () => {
  test('a matinee sale and an evening sale name their own performance, and the session still reconciles whole', async () => {
    await aNightWithRoom()
    const suffix = crypto.randomUUID().slice(0, 6)
    const ids = withBatch((runner) => {
      const venueId = testVenue(runner, { suffix: `two-houses-${suffix}` }).id
      runner.batch([[`INSERT INTO shift_templates (id, venue_id, role, "count", starts_before_doors_minutes, ends_after_end_minutes)
                      VALUES (?, ?, 'BAR', 1, 0, 0)`, `two-houses-bar-${suffix}`, venueId]])
      const matineeId = tonightsPerformance(runner, { suffix: `two-houses-matinee-${suffix}`, venueId }).performanceId
      const eveningId = tonightsPerformance(runner, { suffix: `two-houses-evening-${suffix}`, venueId }).performanceId
      return { venueId, matineeId, eveningId }
    })
    const variantId = await aSellableVariant()

    // The officer's bypass covers both houses, so the bar's windows alone decide between them.
    const opened = await send('POST', '/api/till', { venueId: ids.venueId })
    expect(opened.status).toBe(200)
    const { session } = await opened.json() as { session: { id: string } }

    placeHouses(ids, 'matinee')
    const matineeSale = await sellOnTheTill(app.baseURL, { venueId: ids.venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, admin.cookie)
    expect(matineeSale.status).toBe(200)
    const { entryId: matineeEntry } = await matineeSale.json() as { entryId: string }

    placeHouses(ids, 'evening')
    const eveningSale = await sellOnTheTill(app.baseURL, { venueId: ids.venueId, lines: [{ variantId, qty: 2 }], expectedTotalPence: 500 }, admin.cookie)
    expect(eveningSale.status).toBe(200)
    const { entryId: eveningEntry } = await eveningSale.json() as { entryId: string }

    expect(barLinesOf(matineeEntry)).toEqual([{ performance_id: ids.matineeId, till_session_id: session.id }])
    expect(barLinesOf(eveningEntry)).toEqual([{ performance_id: ids.eveningId, till_session_id: session.id }])

    // The split is per house; the session's own figure is both sales, as one house's would be.
    const previewed = await send('GET', `/api/till/${session.id}/reconciliation`)
    expect(previewed.status).toBe(200)
    const reconciliation = await previewed.json() as { bar: { cardSalesPence: number, expectedPence: number } }
    expect(reconciliation.bar).toMatchObject({ cardSalesPence: 750, expectedPence: 750 })
  }, 240_000)
})
