import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-114. The old app had no way to say a room was closed, so members booked into a get-in and
// found out on the night (RM-6). A closure explains itself rather than reading as "Booked".

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
  member = await registerMember(app, 'blacked-out', generatePassword())
  giveMembership(member.id)
  giveMembership(admin.id)
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

function all<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
  }
  finally {
    database.close()
  }
}

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

async function makeRoom(over: Record<string, unknown> = {}): Promise<string> {
  const answered = await send('POST', '/api/admin/rooms', {
    name: `Room ${crypto.randomUUID().slice(0, 8)}`,
    ...over,
  }, officer)
  return (await answered.json() as { id: string }).id
}

// Well clear of the notice window, so a booking confirms and only the closure can stop it.
function span(daysAhead: number, hour = 14, hours = 2): { startsAt: string, endsAt: string } {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + daysAhead)
  start.setUTCHours(hour, 0, 0, 0)
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString() }
}

const book = (roomId: string, when: { startsAt: string, endsAt: string }, as = member.cookie): Promise<Response> =>
  send('POST', '/api/rooms/bookings', { roomId, title: 'Rehearsal', ...when }, as)

const closeRoom = (roomId: string | null, when: { startsAt: string, endsAt: string }, reason = 'Get-in for the autumn show'): Promise<Response> =>
  send('POST', '/api/admin/rooms/blackouts', { roomId, reason, ...when }, officer)

describe.skipIf(skip !== null)('closing a room (criterion 1)', () => {
  test('an officer closes one room with a reason', async () => {
    const room = await makeRoom()
    const answered = await closeRoom(room, span(30))

    expect(answered.status).toBe(200)
    const body = await answered.json() as { id: string, cancelled: number }
    expect(body.cancelled).toBe(0)

    const held = read<{ reason: string, room_id: string }>(
      'SELECT reason, room_id FROM room_blackouts WHERE id = ?', body.id)
    expect(held?.reason).toBe('Get-in for the autumn show')
    expect(held?.room_id).toBe(room)
  })

  test('a closure with no room covers every room', async () => {
    const answered = await closeRoom(null, span(31), 'Fire alarm test')
    const { id } = await answered.json() as { id: string }
    expect(read<{ room_id: string | null }>('SELECT room_id FROM room_blackouts WHERE id = ?', id)?.room_id).toBeNull()
  })

  test('a reason is required', async () => {
    const room = await makeRoom()
    expect((await send('POST', '/api/admin/rooms/blackouts', { roomId: room, reason: '', ...span(32) }, officer)).status)
      .toBe(400)
  })

  test('a closure ends after it starts', async () => {
    const room = await makeRoom()
    const when = span(33)
    const answered = await send('POST', '/api/admin/rooms/blackouts',
      { roomId: room, reason: 'Backwards', startsAt: when.endsAt, endsAt: when.startsAt }, officer)
    expect(answered.status).toBe(400)
  })

  test('a member cannot close a room', async () => {
    const room = await makeRoom()
    expect((await send('POST', '/api/admin/rooms/blackouts',
      { roomId: room, reason: 'Not mine to close', ...span(34) }, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('a closed room refuses, with the reason (criterion 2)', () => {
  test('a booking inside a closure is refused and told why', async () => {
    const room = await makeRoom()
    await closeRoom(room, span(35), 'Rewiring the grid')

    const refused = await book(room, span(35))
    expect(refused.status).toBe(422)

    const body = await refused.json() as { statusMessage: string, data: { failures: { reason: string }[] } }
    // Never masked as "Booked": a member turned away deserves to know it is rewiring.
    expect(body.statusMessage).toContain('Rewiring the grid')
    expect(body.data.failures[0]!.reason).toBe('ROOM_CLOSED')
  })

  test('a booking that only touches the edge of a closure is refused', async () => {
    const room = await makeRoom()
    await closeRoom(room, span(36, 14, 2))
    expect((await book(room, span(36, 15, 2))).status).toBe(422)
  })

  test('a booking ending exactly as a closure starts is fine', async () => {
    const room = await makeRoom()
    await closeRoom(room, span(37, 14, 2))
    expect((await book(room, span(37, 12, 2))).status).toBe(200)
  })

  test('a closure of every room refuses a booking in any of them', async () => {
    const room = await makeRoom()
    await closeRoom(null, span(38), 'Building closed')
    expect((await book(room, span(38))).status).toBe(422)
  })

  test('a request cannot get round a closure either', async () => {
    const room = await makeRoom()
    await closeRoom(room, span(39), 'Deep clean')

    const asked = await send('POST', '/api/rooms/requests', {
      roomId: room,
      title: 'Please',
      reason: 'I really need it',
      ...span(39),
    }, member.cookie)

    expect(asked.status).toBe(422)
    expect((await asked.json() as { statusMessage: string }).statusMessage).toContain('Deep clean')
  })

  test('another room is unaffected', async () => {
    const shut = await makeRoom()
    const open = await makeRoom()
    await closeRoom(shut, span(40))
    expect((await book(open, span(40))).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('closing over existing bookings (criterion 3)', () => {
  test('the bookings are cancelled, told, and given the reason', async () => {
    const room = await makeRoom()
    const booked = await book(room, span(41))
    expect(booked.status).toBe(200)
    const { id } = await booked.json() as { id: string }

    const sentBefore = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'room.blackout.cancelled'`,
      member.id)?.n ?? 0

    const answered = await closeRoom(room, span(41), 'Emergency maintenance')
    expect((await answered.json() as { cancelled: number }).cancelled).toBe(1)

    const after = read<{ status: string, rejection_reason: string }>(
      'SELECT status, rejection_reason FROM room_bookings WHERE id = ?', id)
    expect(after?.status).toBe('CANCELLED')
    expect(after?.rejection_reason).toContain('Emergency maintenance')

    const sentAfter = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'room.blackout.cancelled'`,
      member.id)?.n ?? 0
    expect(sentAfter - sentBefore).toBe(1)
  })

  test('a pending request in the span goes too', async () => {
    const room = await makeRoom({ sensitive: true })
    const asked = await send('POST', '/api/rooms/requests', {
      roomId: room,
      title: 'Waiting on a decision',
      reason: 'A sensitive room always asks',
      ...span(42),
    }, member.cookie)
    const { id } = await asked.json() as { id: string }

    await closeRoom(room, span(42), 'Closed after all')
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', id)?.status).toBe('CANCELLED')
  })

  test('a booking outside the span is left alone', async () => {
    const room = await makeRoom()
    const kept = await book(room, span(43, 9, 1))
    const { id } = await kept.json() as { id: string }

    await closeRoom(room, span(43, 14, 2))
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', id)?.status).toBe('CONFIRMED')
  })

  test('several bookings from one member are one message, not one each', async () => {
    const room = await makeRoom()
    await book(room, span(44, 9, 1))
    await book(room, span(44, 11, 1))
    await book(room, span(44, 13, 1))

    const before = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'room.blackout.cancelled'`,
      member.id)?.n ?? 0

    const answered = await closeRoom(room, span(44, 8, 8), 'Whole day gone')
    const body = await answered.json() as { cancelled: number, told: number }

    expect(body.cancelled).toBe(3)
    expect(body.told).toBe(1)

    const after = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'room.blackout.cancelled'`,
      member.id)?.n ?? 0
    expect(after - before).toBe(1)
  })

  // A get-in on one Monday must not take a whole term with it.
  test('only the overlapping occurrences of a series are cancelled', async () => {
    const room = await makeRoom()
    await send('PUT', '/api/admin/config/ROOM_ACTIVE_BOOKINGS_PER_MEMBER', { value: 500 }, officer)

    const startsOn = new Date()
    startsOn.setUTCDate(startsOn.getUTCDate() + 50)
    while (startsOn.getUTCDay() !== 1) startsOn.setUTCDate(startsOn.getUTCDate() + 1)
    const day = startsOn.toISOString().slice(0, 10)

    const answered = await send('POST', '/api/rooms/series', {
      roomId: room,
      title: 'Weekly rehearsal',
      frequency: 'WEEKLY',
      weekdays: [1],
      startsOn: day,
      from: '14:00',
      to: '16:00',
      occurrences: 3,
    }, member.cookie)
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const held = all<{ id: string, starts_at: number }>(
      'SELECT id, starts_at FROM room_bookings WHERE series_id = ? ORDER BY starts_at', id)
    expect(held).toHaveLength(3)

    // Close only the second Monday.
    const second = new Date(held[1]!.starts_at * 1000)
    await closeRoom(room, {
      startsAt: new Date(second.getTime() - 3_600_000).toISOString(),
      endsAt: new Date(second.getTime() + 4 * 3_600_000).toISOString(),
    }, 'Get-in that week')

    const statuses = all<{ status: string }>(
      'SELECT status FROM room_bookings WHERE series_id = ? ORDER BY starts_at', id).map(row => row.status)
    expect(statuses).toEqual(['CONFIRMED', 'CANCELLED', 'CONFIRMED'])
  })

  test('a series whose head is closed over promotes the next occurrence', async () => {
    const room = await makeRoom()
    const startsOn = new Date()
    startsOn.setUTCDate(startsOn.getUTCDate() + 60)
    while (startsOn.getUTCDay() !== 2) startsOn.setUTCDate(startsOn.getUTCDate() + 1)

    const answered = await send('POST', '/api/rooms/series', {
      roomId: room,
      title: 'Weekly rehearsal',
      frequency: 'WEEKLY',
      weekdays: [2],
      startsOn: startsOn.toISOString().slice(0, 10),
      from: '14:00',
      to: '16:00',
      occurrences: 3,
    }, member.cookie)
    const { id } = await answered.json() as { id: string }
    const held = all<{ id: string, starts_at: number }>(
      'SELECT id, starts_at FROM room_bookings WHERE series_id = ? ORDER BY starts_at', id)

    expect(read<{ head: string }>('SELECT head_booking_id AS head FROM room_series WHERE id = ?', id)?.head)
      .toBe(held[0]!.id)

    const first = new Date(held[0]!.starts_at * 1000)
    await closeRoom(room, {
      startsAt: new Date(first.getTime() - 3_600_000).toISOString(),
      endsAt: new Date(first.getTime() + 4 * 3_600_000).toISOString(),
    }, 'The first week is off')

    expect(read<{ head: string }>('SELECT head_booking_id AS head FROM room_series WHERE id = ?', id)?.head)
      .toBe(held[1]!.id)
  })

  test('a series may skip its blacked-out weeks and book the rest', async () => {
    const room = await makeRoom()
    const startsOn = new Date()
    startsOn.setUTCDate(startsOn.getUTCDate() + 70)
    while (startsOn.getUTCDay() !== 3) startsOn.setUTCDate(startsOn.getUTCDate() + 1)
    const day = startsOn.toISOString().slice(0, 10)

    // The first Wednesday is shut, so the whole term is refused until it is left out.
    const shutFrom = new Date(startsOn)
    shutFrom.setUTCHours(13, 0, 0, 0)
    await closeRoom(room, {
      startsAt: shutFrom.toISOString(),
      endsAt: new Date(shutFrom.getTime() + 5 * 3_600_000).toISOString(),
    }, 'Half term')

    const ask = (skipDays: string[]): Promise<Response> => send('POST', '/api/rooms/series', {
      roomId: room,
      title: 'Weekly rehearsal',
      frequency: 'WEEKLY',
      weekdays: [3],
      startsOn: day,
      from: '14:00',
      to: '16:00',
      occurrences: 3,
      skip: skipDays,
    }, member.cookie)

    const refused = await ask([])
    expect(refused.status).toBe(422)
    const body = await refused.json() as { data: { refusals: { day: string, failures: { reason: string }[] }[] } }
    expect(body.data.refusals).toHaveLength(1)
    expect(body.data.refusals[0]!.failures.some(one => one.reason === 'ROOM_CLOSED')).toBe(true)

    // Explicitly left out, never dropped for them (criterion 2).
    const answered = await ask(body.data.refusals.map(one => one.day))
    expect(answered.status).toBe(200)
    expect((await answered.json() as { occurrences: unknown[] }).occurrences).toHaveLength(2)
  })
})

describe.skipIf(skip !== null)('a closure is on the calendar for everybody (criterion 4)', () => {
  test('availability carries the closure and its reason, unmasked', async () => {
    const room = await makeRoom()
    const when = span(45)
    await closeRoom(room, when, 'Scenic build')

    const day = when.startsAt.slice(0, 10)
    const answered = await send('GET', `/api/rooms/availability?from=${day}&to=${day}&roomId=${room}`, null, member.cookie)
    const body = await answered.json() as { rooms: { closed: { reason: string }[] }[] }

    expect(body.rooms[0]!.closed).toHaveLength(1)
    // A member, not an officer, and they still read the reason.
    expect(body.rooms[0]!.closed[0]!.reason).toBe('Scenic build')
  })

  test('a closure of every room shows on each of them', async () => {
    const room = await makeRoom()
    const when = span(46)
    await closeRoom(null, when, 'Power off')

    const day = when.startsAt.slice(0, 10)
    const body = await (await send('GET', `/api/rooms/availability?from=${day}&to=${day}&roomId=${room}`, null, member.cookie))
      .json() as { rooms: { closed: { reason: string }[] }[] }

    expect(body.rooms[0]!.closed.some(one => one.reason === 'Power off')).toBe(true)
  })
})

describe.skipIf(skip !== null)('reopening restores nothing (criterion 5)', () => {
  test('the room is bookable again, and the cancelled booking stays cancelled', async () => {
    const room = await makeRoom()
    const when = span(47)
    const { id: booking } = await (await book(room, when)).json() as { id: string }

    const { id: closure } = await (await closeRoom(room, when, 'Then not')).json() as { id: string }
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status).toBe('CANCELLED')

    const removed = await send('DELETE', `/api/admin/rooms/blackouts/${closure}`, {}, officer)
    expect(removed.status).toBe(200)
    expect((await removed.json() as { restored: number }).restored).toBe(0)

    // Still cancelled, and the slot is anybody's now.
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status).toBe('CANCELLED')
    expect((await book(room, when)).status).toBe(200)
  })

  test('removing one that is not there is refused', async () => {
    expect((await send('DELETE', '/api/admin/rooms/blackouts/nothingatall', {}, officer)).status).toBe(404)
  })

  test('a member cannot reopen a room', async () => {
    const room = await makeRoom()
    const { id } = await (await closeRoom(room, span(48))).json() as { id: string }
    expect((await send('DELETE', `/api/admin/rooms/blackouts/${id}`, {}, member.cookie)).status).toBe(403)
  })

  test('every closure and removal is on the trail', async () => {
    const room = await makeRoom()
    const { id } = await (await closeRoom(room, span(49))).json() as { id: string }
    await send('DELETE', `/api/admin/rooms/blackouts/${id}`, {}, officer)

    const entries = all<{ action: string }>(
      'SELECT action FROM audit_log WHERE target = ? ORDER BY created_at', `blackout:${id}`).map(row => row.action)
    expect(entries).toContain('room.blackout.created')
    expect(entries).toContain('room.blackout.removed')
  })
})
