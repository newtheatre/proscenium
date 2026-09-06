import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { showNightOf } from '#shared/utils/show-night'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-108. The old app had no chase for a rota gap, so one found four days out stayed a gap until
// somebody happened to look (Prompt Book P6).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'foh-escalate', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

async function escalate(): Promise<{ performances: number, officers: number, skipped: number }> {
  const answered = await send('POST', '/api/dev/escalate-rota', {}, foh.cookie)
  return await answered.json() as { performances: number, officers: number, skipped: number }
}

function daysFromNow(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86_400
}

// A house on its own for each test, so one test's shifts never leak into another's count.
function performanceInDays(days: number, suffix: string): { venueId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const night = showNightOf(new Date(daysFromNow(days) * 1000))
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { night, suffix })
    return { venueId: made.venueId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

function stampShift(performanceId: string, role: string, slot: number, status = 'OPEN', userId: string | null = null): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`INSERT INTO shifts (id, performance_id, role, slot, status, user_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID().replaceAll('-', ''), performanceId, role, slot, status, userId)
  }
  finally {
    database.close()
  }
}

function notified(userId: string, type = 'shift.rota-unstaffed'): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database
      .query('SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = ?')
      .get(userId, type) as { n: number }).n
  }
  finally {
    database.close()
  }
}

// Idempotency is per London day (criterion 4), so a suite that runs several cases inside one day
// has to clear the log between the ones that check a fresh send, the same way C-113's own suite does.
function clearDigests(): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`DELETE FROM notification_log WHERE type = 'shift.rota-unstaffed'`).run()
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('the seven-day unstaffed digest (E-108)', () => {
  test('an open shift inside seven days is chased, and the officer is told (criterion 1)', async () => {
    clearDigests()
    const house = performanceInDays(3, 'open-shift')
    stampShift(house.performanceId, 'DOOR', 1, 'OPEN')

    const answer = await escalate()
    expect(answer.performances).toBeGreaterThan(0)
    expect(notified(foh.id)).toBeGreaterThan(0)
  })

  test('a venue with no template stamps nothing, and that reads as unstaffed too (E-101 criterion 4)', async () => {
    const before = await escalate()
    performanceInDays(3, 'no-template')
    // No stampShift call: the venue's template is empty, so the performance carries no shifts
    // at all, exactly the state E-101 criterion 4 says must surface here rather than pass by.

    const after = await escalate()
    expect(after.performances).toBe(before.performances + 1)
  })

  test('a fully confirmed performance sends nothing about itself (criterion 3)', async () => {
    const before = await escalate()
    const house = performanceInDays(4, 'fully-staffed')
    stampShift(house.performanceId, 'DUTY_MANAGER', 1, 'CONFIRMED', admin.id)
    stampShift(house.performanceId, 'DOOR', 1, 'CONFIRMED', admin.id)

    const after = await escalate()
    expect(after.performances).toBe(before.performances)
  })

  test('a claimed, unconfirmed duty manager is flagged even with every other slot filled (criterion 2)', async () => {
    clearDigests()
    const house = performanceInDays(5, 'unconfirmed-dm')
    stampShift(house.performanceId, 'DUTY_MANAGER', 1, 'CLAIMED', admin.id)
    stampShift(house.performanceId, 'DOOR', 1, 'CONFIRMED', admin.id)

    const answer = await escalate()
    expect(answer.performances).toBeGreaterThan(0)
    expect(notified(foh.id)).toBeGreaterThan(0)
  })

  // A declined claim leaves nobody committed, exactly like an open shift, so it is chased the
  // same way rather than staying invisible until somebody happens to check (E-107, known issue).
  test('a declined shift inside seven days is chased too', async () => {
    clearDigests()
    const house = performanceInDays(3, 'declined-shift')
    stampShift(house.performanceId, 'BAR', 1, 'DECLINED', admin.id)

    const answer = await escalate()
    expect(answer.performances).toBeGreaterThan(0)
    expect(notified(foh.id)).toBeGreaterThan(0)
  })

  test('a performance more than seven days out is not chased', async () => {
    const before = await escalate()
    const house = performanceInDays(10, 'too-far')
    stampShift(house.performanceId, 'DOOR', 1, 'OPEN')

    const after = await escalate()
    expect(after.performances).toBe(before.performances)
  })

  test('running it twice the same day tells the officer once more, not twice (criterion 4)', async () => {
    clearDigests()
    const house = performanceInDays(6, 'twice')
    stampShift(house.performanceId, 'BAR', 1, 'OPEN')

    await escalate()
    const afterFirst = notified(foh.id)
    expect(afterFirst).toBeGreaterThan(0)
    await escalate()
    expect(notified(foh.id)).toBe(afterFirst)
  })

  test('an ordinary member cannot trigger it', async () => {
    const member = await registerMember(app, 'not-foh', generatePassword())
    expect((await send('POST', '/api/dev/escalate-rota', {}, member.cookie)).status).toBe(403)
  })
})
