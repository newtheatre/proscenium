import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, grantCommitteeRole, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Decision 0101 through the real routes: the guard, the send and the record. The resolvers are
// pinned in tests/integration/night-message.test.ts.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT OR IGNORE INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)').run('tt-standard', 'Standard', 900, 'SINGLE')
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function withDatabase<T>(fn: (database: Database) => T): T {
  const database = new Database(app.databaseFile)
  try {
    return fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(statement: string, ...parameters: unknown[]): T[] {
  return withDatabase(database => database.query(statement).all(...parameters as never[]) as T[])
}

function write(statement: string, ...parameters: unknown[]): void {
  withDatabase(database => database.query(statement).run(...parameters as never[]))
}

function house(suffix: string): string {
  return withDatabase(database => tonightsPerformance({
    batch: statements => database.transaction(() => {
      for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
    })(),
  }, { suffix }).performanceId)
}

function shift(performanceId: string, role: string, userId: string, slot = 1): void {
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
    `${performanceId}-${role}-${slot}`, performanceId, role, slot, userId, 'CONFIRMED')
  if (role === 'DUTY_MANAGER') grantCommitteeRole(app, userId)
}

function holding(performanceId: string, userId: string, reference: string): void {
  write('INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
    `r-${reference}`, reference, performanceId, userId, 'COLLECTED', 'WEB')
  write(`INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)`,
    `t-${reference}`, `r-${reference}`, performanceId, 'tt-standard', 900, 'BASE')
}

const message = (performanceId: string, audience: string, draftKey: string = crypto.randomUUID()): Record<string, string> =>
  ({ performanceId, audience, subject: 'Doors at 19:15 tonight', body: 'A late get-in: the house opens a quarter of an hour late.', draftKey })

describe.skipIf(skip !== null)('tonight\'s duty manager messages tonight\'s audience (0101)', () => {
  test('ticket holders are counted, then told at once, and the send is recorded', async () => {
    const dm = await registerMember(app, 'message-dm', generatePassword())
    const holderOne = await registerMember(app, 'message-holder-one', generatePassword())
    const holderTwo = await registerMember(app, 'message-holder-two', generatePassword())
    const performanceId = house('message-holders')
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    holding(performanceId, holderOne.id, 'MSGH01')
    holding(performanceId, holderTwo.id, 'MSGH02')

    const counted = await send('GET', `/api/tonight/message/audience?performanceId=${performanceId}&audience=TICKET_HOLDERS`, undefined, dm.cookie)
    expect(counted.status).toBe(200)
    expect(await counted.json()).toEqual({ count: 2 })

    const previewed = await send('POST', '/api/tonight/message/preview', message(performanceId, 'TICKET_HOLDERS'), dm.cookie)
    expect(previewed.status).toBe(200)
    expect((await previewed.json() as { count: number }).count).toBe(2)

    const sent = await send('POST', '/api/tonight/message', message(performanceId, 'TICKET_HOLDERS'), dm.cookie)
    expect(sent.status).toBe(200)
    expect(await sent.json()).toEqual({ count: 2, alreadyOut: 0, resent: 0, stillSending: 0 })

    const logged = read<{ user_id: string }>(`SELECT DISTINCT user_id FROM notification_log WHERE type = 'admin.ticket-holders.safety-notice' AND user_id IN (?, ?)`, holderOne.id, holderTwo.id)
    expect(logged.map(row => row.user_id).sort()).toEqual([holderOne.id, holderTwo.id].sort())

    const [audit] = read<{ actor_id: string, detail: string }>(`SELECT actor_id, detail FROM audit_log WHERE action = 'comms.announcement.sent' AND actor_id = ?`, dm.id)
    expect(JSON.parse(audit!.detail)).toMatchObject({ audienceKind: 'PERFORMANCE_TICKET_HOLDERS', performanceId, recipientCount: 2, safetyNotice: true, via: 'SHIFT' })
  })

  // A dropped connection after the fan-out leaves nothing to check but Send again (0048).
  test('the same draft sent twice reaches each person once, and the second says so', async () => {
    const dm = await registerMember(app, 'message-twice-dm', generatePassword())
    const holder = await registerMember(app, 'message-twice-holder', generatePassword())
    const performanceId = house('message-twice')
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    holding(performanceId, holder.id, 'MSGT01')
    const draftKey = crypto.randomUUID()

    const first = await send('POST', '/api/tonight/message', message(performanceId, 'TICKET_HOLDERS', draftKey), dm.cookie)
    expect(await first.json()).toEqual({ count: 1, alreadyOut: 0, resent: 0, stillSending: 0 })
    const again = await send('POST', '/api/tonight/message', message(performanceId, 'TICKET_HOLDERS', draftKey), dm.cookie)
    expect(await again.json()).toEqual({ count: 0, alreadyOut: 1, resent: 0, stillSending: 0 })

    expect(read(`SELECT id FROM notification_log WHERE type = 'admin.ticket-holders.safety-notice' AND user_id = ?`, holder.id)).toHaveLength(1)
    const audits = read<{ detail: string }>(`SELECT detail FROM audit_log WHERE action = 'comms.announcement.sent' AND actor_id = ? ORDER BY created_at`, dm.id)
    expect(audits.map(row => (JSON.parse(row.detail) as { recipientCount: number }).recipientCount)).toEqual([1, 0])

    const edited = await send('POST', '/api/tonight/message', message(performanceId, 'TICKET_HOLDERS'), dm.cookie)
    expect(await edited.json()).toEqual({ count: 1, alreadyOut: 0, resent: 0, stillSending: 0 })
  })

  test('the rota is that performance\'s team, told at once', async () => {
    const dm = await registerMember(app, 'message-rota-dm', generatePassword())
    const door = await registerMember(app, 'message-rota-door', generatePassword())
    const performanceId = house('message-rota')
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    shift(performanceId, 'DOOR', door.id)

    const sent = await send('POST', '/api/tonight/message', message(performanceId, 'ROTA'), dm.cookie)
    expect(sent.status).toBe(200)
    expect(await sent.json()).toEqual({ count: 2, alreadyOut: 0, resent: 0, stillSending: 0 })
    expect(read(`SELECT id FROM notification_log WHERE type = 'admin.safety-notice' AND user_id = ?`, door.id).length).toBeGreaterThan(0)
  })

  test('a door shift cannot message the audience, and nor can a member with no shift', async () => {
    const door = await registerMember(app, 'message-door-only', generatePassword())
    const member = await registerMember(app, 'message-nobody', generatePassword())
    const performanceId = house('message-refused')
    shift(performanceId, 'DOOR', door.id)

    expect((await send('POST', '/api/tonight/message', message(performanceId, 'TICKET_HOLDERS'), door.cookie)).status).toBe(403)
    expect((await send('POST', '/api/tonight/message', message(performanceId, 'TICKET_HOLDERS'), member.cookie)).status).toBe(403)
    expect((await send('GET', `/api/tonight/message/audience?performanceId=${performanceId}&audience=ROTA`, undefined, door.cookie)).status).toBe(403)
  })

  // 0044 and 0098: an officer standing in is recorded once for the night, as any act is.
  test('an officer with no shift sends as standing in, and is recorded', async () => {
    const performanceId = house('message-officer')

    const sent = await send('POST', '/api/tonight/message', message(performanceId, 'ROTA'))
    expect(sent.status).toBe(200)

    const [audit] = read<{ detail: string }>(`SELECT detail FROM audit_log WHERE action = 'comms.announcement.sent' AND actor_id = ? ORDER BY created_at DESC`, admin.id)
    expect(JSON.parse(audit!.detail)).toMatchObject({ audienceKind: 'PERFORMANCE_ROTA', performanceId, via: 'OFFICER' })
    const bypasses = read<{ target: string }>(`SELECT target FROM audit_log WHERE action = 'night.officer-bypass' AND actor_id = ?`, admin.id)
    expect(bypasses.some(row => row.target.endsWith(':DUTY_MANAGER'))).toBe(true)
  })
})

// 0108: a copy whose send was cut off between its claim and its send is resent by a retry of the
// same draft once its claim is 30 seconds old, and left alone before that.
describe.skipIf(skip !== null)('a retry reaches anyone an interrupted send skipped (0108)', () => {
  function stuckClaim(draftKey: string, senderId: string, userId: string, ageSeconds: number): void {
    write(`INSERT INTO notification_log (id, user_id, type, channel, status, claim, created_at) VALUES (?, ?, 'admin.ticket-holders.safety-notice', 'EMAIL', 'PENDING', ?, unixepoch() - ?)`,
      crypto.randomUUID().replaceAll('-', ''), userId, `night-message:${draftKey}:${senderId}:${userId}`, ageSeconds)
  }

  test('a claim stuck for over 30 seconds is resent, and one younger is reported as still sending', async () => {
    const dm = await registerMember(app, 'message-stuck-dm', generatePassword())
    const stuck = await registerMember(app, 'message-stuck-holder', generatePassword())
    const young = await registerMember(app, 'message-young-holder', generatePassword())
    const performanceId = house('message-stuck')
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    holding(performanceId, stuck.id, 'MSGS01')
    holding(performanceId, young.id, 'MSGS02')
    const draftKey = crypto.randomUUID()
    stuckClaim(draftKey, dm.id, stuck.id, 120)
    stuckClaim(draftKey, dm.id, young.id, 2)

    const retried = await send('POST', '/api/tonight/message', message(performanceId, 'TICKET_HOLDERS', draftKey), dm.cookie)
    expect(retried.status).toBe(200)
    expect(await retried.json()).toEqual({ count: 1, alreadyOut: 0, resent: 1, stillSending: 1 })

    const rowsFor = (userId: string): { status: string }[] =>
      read<{ status: string }>(`SELECT status FROM notification_log WHERE type = 'admin.ticket-holders.safety-notice' AND user_id = ? ORDER BY created_at, rowid`, userId)
    expect(rowsFor(stuck.id).map(row => row.status)).toEqual(['FAILED_FINAL', 'SENT'])
    expect(rowsFor(young.id).map(row => row.status)).toEqual(['PENDING'])
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
