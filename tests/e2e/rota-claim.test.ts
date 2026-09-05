import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { showNightOf } from '#shared/utils/show-night'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { expectOneWinner, race } from '#tests/helpers/race'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { AppUnderTest } from '#tests/helpers/webview'

// E-104 (claiming) and E-105 (the auto-confirm setting and its queue), through the real route and
// the real screen. What the database refuses is pinned in `tests/integration/rota.test.ts`.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let member: TestMember
let other: TestMember
let moduleId = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'foh-approver', generatePassword())
  await send('POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' })

  member = await registerMember(app, 'claimant', generatePassword())
  other = await registerMember(app, 'other-claimant', generatePassword())

  const department = `ROT${suffix()}`
  expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'Rota claiming' })).status).toBe(200)
  moduleId = `${department}-${suffix()}`
  expect((await send('POST', '/api/admin/training/modules', {
    id: moduleId, department, kind: 'MODULE', name: `Module ${moduleId}`, status: 'ACTIVE',
  })).status).toBe(200)
  expect((await send('PUT', '/api/admin/config/SHIFT_ELIGIBILITY_DOOR_MODULE', { value: moduleId })).status).toBe(200)

  award(member.id, moduleId)
  award(other.id, moduleId)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

function award(userId: string, moduleId: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`
      INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, ?, 'SIGNOFF')
    `).run(`tr-${crypto.randomUUID().slice(0, 8)}`, userId, moduleId, daysFrom(-30))
  }
  finally {
    database.close()
  }
}

async function setAutoConfirm(value: boolean): Promise<void> {
  expect((await send('PUT', '/api/admin/config/SHIFT_CLAIM_AUTO_CONFIRM', { value })).status).toBe(200)
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

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

// A week out, so the "not yet started" filter on the open list never makes a fixture flicker.
function programme(caseSuffix: string): { performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const night = showNightOf(new Date(Date.now() + 7 * 86_400_000))
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: caseSuffix, night })
    return { performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

function openShift(performanceId: string, role: string, slot: number, id?: string): string {
  const shiftId = id ?? `${performanceId}-${role}-${slot}`
  write('INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, \'OPEN\')',
    shiftId, performanceId, role, slot)
  return shiftId
}

interface ClaimResult { ok: boolean, status: 'CLAIMED' | 'CONFIRMED' }

describe.skipIf(skip !== null)('claiming (E-104)', () => {
  test('an eligible member claims an open shift, auto-confirm on by default', async () => {
    await setAutoConfirm(true)
    const house = programme('claim-confirm')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)

    const answered = await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)
    expect(answered.status).toBe(200)
    expect(await answered.json() as ClaimResult).toMatchObject({ ok: true, status: 'CONFIRMED' })

    expect(read<{ status: string, user_id: string }>('SELECT status, user_id FROM shifts WHERE id = ?', shiftId))
      .toMatchObject({ status: 'CONFIRMED', user_id: member.id })
  })

  test('claiming without the gating module is refused (criterion 1)', async () => {
    const house = programme('claim-ineligible')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)
    const ungated = await registerMember(app, 'no-module', generatePassword())

    const answered = await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, ungated.cookie)
    expect(answered.status).toBe(403)
    expect(read<{ status: string }>('SELECT status FROM shifts WHERE id = ?', shiftId)?.status).toBe('OPEN')
  })

  test('a shift already taken refuses the second claimant (criterion 2)', async () => {
    const house = programme('claim-taken')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)

    expect((await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)).status).toBe(200)
    const second = await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, other.cookie)
    expect(second.status).toBe(409)
    expect((await second.json() as { statusMessage: string }).statusMessage).toContain('already been taken')
  })

  test('a member cannot claim a second shift on the same performance (criterion 3)', async () => {
    const house = programme('claim-double')
    const first = openShift(house.performanceId, 'DOOR', 1)
    const second = openShift(house.performanceId, 'DOOR', 2)

    expect((await send('POST', `/api/rota/shifts/${first}/claim`, undefined, member.cookie)).status).toBe(200)
    const refused = await send('POST', `/api/rota/shifts/${second}/claim`, undefined, member.cookie)
    expect(refused.status).toBe(409)
    expect((await refused.json() as { statusMessage: string }).statusMessage).toContain('already hold a shift')
  })

  test('a missing shift 404s', async () => {
    expect((await send('POST', '/api/rota/shifts/no-such-shift/claim', undefined, member.cookie)).status).toBe(404)
  })

  // Supplementary to the integration-layer proof in races-shifts.test.ts, which is the real
  // guarantee: an in-process SQLite serialises, so this only confirms the wiring (K-105).
  test('concurrent claims over HTTP still resolve to exactly one winner', async () => {
    const house = programme('claim-race')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)
    const claimants = [member, other]

    const answers = await race(2, async (index) => {
      const answered = await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, claimants[index]!.cookie)
      return { status: answered.status }
    })
    expectOneWinner(answers)
  })
})

describe.skipIf(skip !== null)('the queue (E-105)', () => {
  test('queue mode claims as CLAIMED, not CONFIRMED', async () => {
    await setAutoConfirm(false)
    const house = programme('queue-claim')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)

    const answered = await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)
    expect(answered.status).toBe(200)
    expect(await answered.json() as ClaimResult).toMatchObject({ ok: true, status: 'CLAIMED' })
    await setAutoConfirm(true)
  })

  test('a queued claim appears on the approval list and an ordinary member cannot reach it', async () => {
    await setAutoConfirm(false)
    const house = programme('queue-list')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)
    await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)

    expect((await send('GET', '/api/admin/rota/approvals', undefined, member.cookie)).status).toBe(403)

    const listed = await send('GET', '/api/admin/rota/approvals', undefined, foh.cookie)
    expect(listed.status).toBe(200)
    const { items } = await listed.json() as { items: { shiftId: string }[] }
    expect(items.map(item => item.shiftId)).toContain(shiftId)
    await setAutoConfirm(true)
  })

  test('approving confirms the shift and notifies the claimant, twice fails the second time', async () => {
    await setAutoConfirm(false)
    const house = programme('queue-approve')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)
    await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)

    const before = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'shift.approved'`, member.id)?.n ?? 0

    const approved = await send('POST', `/api/admin/rota/approvals/${shiftId}/approve`, undefined, foh.cookie)
    expect(approved.status).toBe(200)
    expect(read<{ status: string }>('SELECT status FROM shifts WHERE id = ?', shiftId)?.status).toBe('CONFIRMED')

    const after = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'shift.approved'`, member.id)?.n ?? 0
    expect(after - before).toBe(1)

    expect((await send('POST', `/api/admin/rota/approvals/${shiftId}/approve`, undefined, foh.cookie)).status).toBe(409)
    await setAutoConfirm(true)
  })

  test('declining carries a reason the claimant is shown, and takes them off the shift', async () => {
    await setAutoConfirm(false)
    const house = programme('queue-decline')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)
    await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)

    const declined = await send('POST', `/api/admin/rota/approvals/${shiftId}/decline`, { reason: 'Double-booked with another shift' }, foh.cookie)
    expect(declined.status).toBe(200)

    expect(read<{ status: string, decline_reason: string }>('SELECT status, decline_reason FROM shifts WHERE id = ?', shiftId))
      .toMatchObject({ status: 'DECLINED', decline_reason: 'Double-booked with another shift' })

    const sent = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'shift.declined'`, member.id)?.n ?? 0
    expect(sent).toBeGreaterThan(0)

    expect((await send('POST', `/api/admin/rota/approvals/${shiftId}/decline`, { reason: 'Too late' }, foh.cookie)).status).toBe(409)
    await setAutoConfirm(true)
  })

  test('an empty reason is refused before it reaches the write', async () => {
    await setAutoConfirm(false)
    const house = programme('queue-decline-empty')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)
    await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)

    expect((await send('POST', `/api/admin/rota/approvals/${shiftId}/decline`, { reason: '' }, foh.cookie)).status).toBe(400)
    await setAutoConfirm(true)
  })

  test('changing the setting does not touch a claim already made', async () => {
    await setAutoConfirm(false)
    const house = programme('queue-unaffected')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)
    await send('POST', `/api/rota/shifts/${shiftId}/claim`, undefined, member.cookie)

    await setAutoConfirm(true)
    expect(read<{ status: string }>('SELECT status FROM shifts WHERE id = ?', shiftId)?.status).toBe('CLAIMED')
  })
})

describe.skipIf(skip !== null)('claiming from the screen', () => {
  test('a claimed shift moves from the open list to what you hold', async () => {
    await setAutoConfirm(true)
    const house = programme('screen-claim')
    const shiftId = openShift(house.performanceId, 'DOOR', 1)

    const password = generatePassword()
    const person = await registerMember(app, 'screen-claimant', password)
    award(person.id, moduleId)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', person.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)

      await visit(view, `${app.baseURL}/rota`, `[data-test="claim-${shiftId}"]`)
      await click(view, `[data-test="claim-${shiftId}"]`)
      await waitFor(view, `document.querySelector('[data-test="my-shift-${shiftId}"]')`, 15_000)
    }
    finally {
      view.close()
    }
  }, 120_000)
})
