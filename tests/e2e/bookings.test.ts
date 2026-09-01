import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-106 and C-107. The published policy is the enforced policy, and the database decides who wins
// a contended slot.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let member: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  officer = admin.cookie
  giveMembership(admin.id)
  member = await registerMember(app, 'booker', generatePassword())
  giveMembership(member.id)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

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

// Booking needs a current membership (C-105 criterion 2), which the SU sells and this does not.
function giveMembership(userId: string): void {
  write(
    `INSERT INTO memberships (id, user_id, starts_on, expires_on, source)
     VALUES (?, ?, date('now', '-30 days'), date('now', '+300 days'), 'MANUAL')`,
    crypto.randomUUID().replaceAll('-', ''), userId,
  )
}

const send = (method: string, path: string, body: unknown, as: string): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

// A member of their own, so a case about contention is not also a case about the ten-booking cap:
// bookings made earlier in the suite would otherwise refuse the racers before they ever raced.
async function freshBooker(): Promise<string> {
  const person = await registerMember(app, 'racer', generatePassword())
  giveMembership(person.id)
  return person.cookie
}

// Every weekday open, so the hours rule never gets in the way of a case about something else.
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, opens: '00:00', closes: '23:59' }))

async function makeRoom(over: Record<string, unknown> = {}): Promise<string> {
  const answered = await send('POST', '/api/admin/rooms', {
    name: `Room ${crypto.randomUUID().slice(0, 8)}`,
    hours: ALL_WEEK,
    ...over,
  }, officer)
  return (await answered.json() as { id: string }).id
}

// Well inside the notice window and the horizon: seven days out, at 10:00 UTC.
function soon(daysAhead = 7, hour = 10, hours = 2): { startsAt: string, endsAt: string } {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + daysAhead)
  start.setUTCHours(hour, 0, 0, 0)
  const end = new Date(start.getTime() + hours * 3_600_000)
  return { startsAt: start.toISOString(), endsAt: end.toISOString() }
}

const book = (roomId: string, span: { startsAt: string, endsAt: string }, as = member.cookie, over = {}): Promise<Response> =>
  send('POST', '/api/rooms/bookings', { roomId, title: 'Rehearsal', purpose: 'REHEARSAL', ...span, ...over }, as)

describe.skipIf(skip !== null)('booking within policy (C-106)', () => {
  test('a booking inside every rule confirms instantly', async () => {
    const room = await makeRoom()
    const answered = await book(room, soon())

    expect(answered.status).toBe(200)
    expect((await answered.json() as { status: string }).status).toBe('CONFIRMED')
  })

  test('a sensitive room queues even when nothing is wrong', async () => {
    const room = await makeRoom({ sensitive: true })
    const refused = await book(room, soon())

    expect(refused.status).toBe(422)
    const { data } = await refused.json() as { data: { canRequest: boolean, sensitive: boolean, failures: unknown[] } }
    expect(data.sensitive).toBe(true)
    expect(data.canRequest).toBe(true)
    expect(data.failures).toEqual([])
  })

  test('too little notice names the rule it broke, and offers a request', async () => {
    const room = await makeRoom()
    const refused = await book(room, soon(1, 10))

    expect(refused.status).toBe(422)
    const { data } = await refused.json() as { data: { canRequest: boolean, failures: { reason: string }[] } }
    expect(data.failures.map(failure => failure.reason)).toContain('SHORT_NOTICE')
    expect(data.canRequest).toBe(true)
  })

  test('a room may set its own notice window, overriding the estate', async () => {
    const room = await makeRoom({ noticeHours: 0 })
    expect((await book(room, soon(1, 10))).status).toBe(200)
  })

  // A union room is not a room at all now: asking for one is its own path (0036).
  test('a room the estate does not have cannot be booked', async () => {
    const refused = await send('POST', '/api/rooms/bookings',
      { roomId: 'not-a-room', title: 'Nowhere', purpose: 'REHEARSAL', ...soon() }, member.cookie)
    expect(refused.status).toBe(410)
  })

  // Most rooms have no restriction worth recording, and making an officer fill in seven days to
  // say so is the wrong default.
  test('a room with no hours takes a booking at any hour', async () => {
    const room = await makeRoom({ hours: [] })
    expect((await book(room, soon(8, 3))).status).toBe(200)
  })

  test('a room that has said when it opens refuses one outside them', async () => {
    const room = await makeRoom({ hours: [{ weekday: 0, opens: '09:00', closes: '17:00' }] })
    const refused = await book(room, soon(8, 3))

    expect(refused.status).toBe(422)
    const { data } = await refused.json() as { data: { failures: { reason: string }[] } }
    expect(data.failures.map(failure => failure.reason).some(reason => reason.startsWith('ROOM_') || reason === 'OUT_OF_HOURS')).toBe(true)
  })

  test('a slot in the past is refused outright, not offered as a request', async () => {
    const room = await makeRoom()
    const refused = await book(room, soon(-7))

    expect(refused.status).toBe(422)
    expect((await refused.json() as { data: { canRequest: boolean } }).data.canRequest).toBe(false)
  })

  test('a lapsed membership is refused, and says so', async () => {
    const stranger = await registerMember(app, 'no-membership', generatePassword())
    const room = await makeRoom()
    const refused = await book(room, soon(), stranger.cookie)

    expect(refused.status).toBe(422)
    const { data } = await refused.json() as { data: { failures: { reason: string }[] } }
    expect(data.failures.map(failure => failure.reason)).toContain('NO_MEMBERSHIP')
  })

  test('a retired room is gone, not merely refused', async () => {
    const room = await makeRoom()
    await send('DELETE', `/api/admin/rooms/${room}`, {}, officer)
    expect((await book(room, soon())).status).toBe(410)
  })
})

describe.skipIf(skip !== null)('one slot, one winner (C-107)', () => {
  test('back-to-back bookings both succeed', async () => {
    const room = await makeRoom()
    expect((await book(room, soon(9, 10, 2))).status).toBe(200)
    // Starts exactly where the first ends, which is not a clash (criterion 5).
    expect((await book(room, soon(9, 12, 2))).status).toBe(200)
  })

  test('an overlapping booking is refused with what is in the way', async () => {
    const room = await makeRoom()
    expect((await book(room, soon(10, 10, 2))).status).toBe(200)

    const refused = await book(room, soon(10, 11, 2))
    expect(refused.status).toBe(409)
    const { data } = await refused.json() as { data: { conflicts: { title: string }[] } }
    expect(data.conflicts).toHaveLength(1)
  })

  // Criterion 4, and C-103 criteria 4 and 5: the same masking on any payload listing conflicts.
  test('a member is told the slot is taken, never whose it is', async () => {
    const room = await makeRoom()
    await book(room, soon(11, 10, 2), member.cookie, { title: 'Dress run, The Crucible' })

    const other = await registerMember(app, 'other-booker', generatePassword())
    giveMembership(other.id)
    const refused = await book(room, soon(11, 11, 2), other.cookie)

    const body = await refused.text()
    expect(body).toContain('Booked')
    expect(body).not.toContain('Crucible')
  })

  test('an officer sees what is actually in the way', async () => {
    const room = await makeRoom()
    await book(room, soon(12, 10, 2), member.cookie, { title: 'Dress run, The Seagull' })

    const refused = await send('POST', '/api/rooms/bookings', {
      roomId: room, title: 'Clash', purpose: 'REHEARSAL', ...soon(12, 11, 2),
    }, officer)
    expect(await refused.text()).toContain('Seagull')
  })

  // The named regression case. An in-process SQLite serialises, so this proves no claim is lost
  // and exactly one wins, not that the write is atomic under real contention (0022).
  test('two simultaneous claims on one slot resolve to exactly one booking', async () => {
    const room = await makeRoom()
    const span = soon(13, 10, 2)

    const racer = await freshBooker()
    const answers = await Promise.all([book(room, span, racer), book(room, span, racer)])
    const codes = answers.map(answer => answer.status).sort()

    expect(codes).toEqual([200, 409])
    const held = read<{ n: number }>(
      `SELECT count(*) n FROM room_bookings WHERE room_id = ? AND status = 'CONFIRMED'`, room)
    expect(held?.n).toBe(1)
  })

  test('ten at once still leave exactly one', async () => {
    const room = await makeRoom()
    const span = soon(14, 10, 2)

    const racer = await freshBooker()
    const answers = await Promise.all(Array.from({ length: 10 }, () => book(room, span, racer)))
    expect(answers.filter(answer => answer.status === 200)).toHaveLength(1)
    expect(answers.filter(answer => answer.status === 409)).toHaveLength(9)
  })
})
