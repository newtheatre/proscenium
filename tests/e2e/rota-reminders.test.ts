import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { currentShowNight } from '#shared/utils/show-night'
import { daysAfter } from '#shared/utils/membership'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import type { AppUnderTest } from '#tests/helpers/webview'

// E-109. The clock-change cases are pinned against `tomorrowsShiftNight()` directly in
// `tests/unit/shift-reminders.test.ts`; this is the wiring, the idempotency and the content.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const TOMORROW = daysAfter(currentShowNight(), 1)
const DAY_AFTER = daysAfter(currentShowNight(), 2)

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

function remind(): Promise<Response> {
  return send('POST', '/api/dev/remind-shifts')
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

function performance(night: string, suffix: string): { performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix, night })
    return { performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

function shift(performanceId: string, role: string, userId: string | null, status = 'CONFIRMED'): string {
  const id = `${performanceId}-${role}-${crypto.randomUUID().slice(0, 6)}`
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status, confirmed_at) VALUES (?, ?, ?, 1, ?, ?, unixepoch())',
    id, performanceId, role, userId, status)
  return id
}

describe.skipIf(skip !== null)('reminding tomorrow\'s confirmed shifts (E-109 criterion 1)', () => {
  test('a confirmed shift on tomorrow\'s night is reminded, with the call time in the subject', async () => {
    const holder = await registerMember(app, 'remind-confirmed', generatePassword())
    const house = performance(TOMORROW, 'remind-confirmed')
    shift(house.performanceId, 'DOOR', holder.id)

    const answered = await remind()
    expect(answered.status).toBe(200)

    const row = read<{ status: string, subject: string }>(
      `SELECT status, subject FROM notification_log WHERE user_id = ? AND type = 'shift.reminder'`, holder.id)
    expect(row?.status).toBe('SENT')
    expect(row?.subject).toContain('door')
    expect(row?.subject).toContain('A Test Show')
  })

  test('an open shift is not reminded: nobody holds it', async () => {
    const house = performance(TOMORROW, 'remind-open')
    const shiftId = shift(house.performanceId, 'DOOR', null, 'OPEN')

    await remind()
    const count = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE claim = ?`, `shift.reminder:${shiftId}`)?.n ?? 0
    expect(count).toBe(0)
  })

  test('a claimed but unconfirmed shift is not reminded', async () => {
    const claimant = await registerMember(app, 'remind-claimed', generatePassword())
    const house = performance(TOMORROW, 'remind-claimed')
    shift(house.performanceId, 'BAR', claimant.id, 'CLAIMED')

    await remind()
    const count = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'shift.reminder'`, claimant.id)?.n ?? 0
    expect(count).toBe(0)
  })

  test('a shift the night after tomorrow is not reminded yet', async () => {
    const holder = await registerMember(app, 'remind-too-far', generatePassword())
    const house = performance(DAY_AFTER, 'remind-too-far')
    shift(house.performanceId, 'DOOR', holder.id)

    await remind()
    const count = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'shift.reminder'`, holder.id)?.n ?? 0
    expect(count).toBe(0)
  })

  test('running it twice does not tell the same holder twice (criterion 3)', async () => {
    const holder = await registerMember(app, 'remind-twice', generatePassword())
    const house = performance(TOMORROW, 'remind-twice')
    shift(house.performanceId, 'BAR', holder.id)

    await remind()
    const after1 = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'shift.reminder'`, holder.id)?.n ?? 0
    expect(after1).toBe(1)

    await remind()
    const after2 = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'shift.reminder'`, holder.id)?.n ?? 0
    expect(after2).toBe(1)
  })

  test('two shifts tomorrow for the same person are two separate reminders', async () => {
    const holder = await registerMember(app, 'remind-double', generatePassword())
    const first = performance(TOMORROW, 'remind-double-a')
    const second = performance(TOMORROW, 'remind-double-b')
    shift(first.performanceId, 'DOOR', holder.id)
    shift(second.performanceId, 'BAR', holder.id)

    await remind()
    const count = read<{ n: number }>(
      `SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = 'shift.reminder'`, holder.id)?.n ?? 0
    expect(count).toBe(2)
  })

  test('an ordinary member cannot trigger it', async () => {
    const member = await registerMember(app, 'remind-forbidden', generatePassword())
    expect((await send('POST', '/api/dev/remind-shifts', undefined, member.cookie)).status).toBe(403)
  })
})
