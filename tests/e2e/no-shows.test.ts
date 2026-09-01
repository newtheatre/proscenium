import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-116. The old app promised no-show tracking and never built it, so an empty booked room cost
// nothing at all (RM-1). A member sees the ladder coming rather than being surprised by it.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let officerId = ''
let member: TestMember
let room = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  officer = admin.cookie
  officerId = admin.id
  member = await registerMember(app, 'no-show', generatePassword())
  giveMembership(member.id)
  room = await makeRoom()
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

// Written straight in, in the past: a member cannot book a slot that has already happened, and
// what is under test is the marking rather than the booking.
function pastBooking(userId = member.id, hoursAgo = 24, status = 'CONFIRMED'): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  const start = Math.floor(Date.now() / 1000) - hoursAgo * 3600
  write(
    `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
     VALUES (?, ?, ?, 'Rehearsal', ?, ?, 'GENERAL', ?)`,
    id, room, userId, start, start + 7200, status,
  )
  return id
}

const mark = (bookingId: string, as = officer): Promise<Response> =>
  send('POST', `/api/admin/rooms/bookings/${bookingId}/no-show`, {}, as)

async function standing(): Promise<{ count: number, standing: string, says: string, records: unknown[] }> {
  return (await send('GET', '/api/rooms/standing', null, member.cookie)).json() as never
}

describe.skipIf(skip !== null)('marking one (criterion 1)', () => {
  test('an officer marks a past confirmed booking', async () => {
    const booking = pastBooking()
    const answered = await mark(booking)

    expect(answered.status).toBe(200)
    const record = read<{ user_id: string, recorded_by: string, kind: string }>(
      'SELECT user_id, recorded_by, kind FROM room_no_shows WHERE booking_id = ?', booking)
    expect(record?.user_id).toBe(member.id)
    expect(record?.recorded_by).toBe(officerId)
    expect(record?.kind).toBe('RECORDED')
  })

  test('a booking still to come cannot be marked', async () => {
    const id = crypto.randomUUID().replaceAll('-', '')
    const start = Math.floor(Date.now() / 1000) + 7 * 86_400
    write(
      `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
       VALUES (?, ?, ?, 'Later', ?, ?, 'GENERAL', 'CONFIRMED')`,
      id, room, member.id, start, start + 7200,
    )

    expect((await mark(id)).status).toBe(422)
    expect(read<{ n: number }>('SELECT count(*) n FROM room_no_shows WHERE booking_id = ?', id)?.n).toBe(0)
  })

  test('a cancelled booking cannot be marked', async () => {
    expect((await mark(pastBooking(member.id, 48, 'CANCELLED'))).status).toBe(422)
  })

  test('marking the same booking twice is refused', async () => {
    const booking = pastBooking()
    expect((await mark(booking)).status).toBe(200)
    expect((await mark(booking)).status).toBe(409)
  })

  test('a member cannot mark anybody, including themselves', async () => {
    const booking = pastBooking()
    expect((await mark(booking, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('a correction supersedes, never edits (criterion 2)', () => {
  test('withdrawing adds an entry and leaves the original standing', async () => {
    const booking = pastBooking()
    const { id } = await (await mark(booking)).json() as { id: string }

    const answered = await send('POST', `/api/admin/rooms/no-shows/${id}/withdraw`,
      { reason: 'Recorded against the wrong booking' }, officer)
    expect(answered.status).toBe(200)

    const entries = read<{ n: number }>(
      'SELECT count(*) n FROM room_no_shows WHERE booking_id = ?', booking)
    expect(entries?.n).toBe(2)
    expect(read<{ kind: string }>('SELECT kind FROM room_no_shows WHERE id = ?', id)?.kind).toBe('RECORDED')
  })

  test('a withdrawal needs a reason', async () => {
    const { id } = await (await mark(pastBooking())).json() as { id: string }
    expect((await send('POST', `/api/admin/rooms/no-shows/${id}/withdraw`, {}, officer)).status).toBe(400)
  })

  test('withdrawing twice is refused', async () => {
    const { id } = await (await mark(pastBooking())).json() as { id: string }
    await send('POST', `/api/admin/rooms/no-shows/${id}/withdraw`, { reason: 'Wrong' }, officer)
    expect((await send('POST', `/api/admin/rooms/no-shows/${id}/withdraw`, { reason: 'Again' }, officer)).status)
      .toBe(409)
  })

  test('a withdrawn booking can be marked again, and counts once', async () => {
    const booking = pastBooking()
    const { id } = await (await mark(booking)).json() as { id: string }
    await send('POST', `/api/admin/rooms/no-shows/${id}/withdraw`, { reason: 'Mistake' }, officer)

    const again = await mark(booking)
    expect(again.status).toBe(200)
    // Three entries about one night, and the latest is what counts.
    expect(read<{ n: number }>('SELECT count(*) n FROM room_no_shows WHERE booking_id = ?', booking)?.n).toBe(3)
  })

  test('every mark and withdrawal is on the trail', async () => {
    const booking = pastBooking()
    const { id } = await (await mark(booking)).json() as { id: string }
    await send('POST', `/api/admin/rooms/no-shows/${id}/withdraw`, { reason: 'Wrong night' }, officer)

    const database = new Database(app.databaseFile, { readonly: true })
    const actions = database.query('SELECT action FROM audit_log WHERE target = ? ORDER BY created_at')
      .all(`booking:${booking}`) as { action: string }[]
    database.close()

    expect(actions.map(one => one.action)).toContain('room.no-show.recorded')
    expect(actions.map(one => one.action)).toContain('room.no-show.withdrawn')
  })

  test('the words of a withdrawal stay out of the trail', async () => {
    const booking = pastBooking()
    const { id } = await (await mark(booking)).json() as { id: string }
    await send('POST', `/api/admin/rooms/no-shows/${id}/withdraw`,
      { reason: 'They were in hospital that week' }, officer)

    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE target = ? AND action = 'room.no-show.withdrawn'`, `booking:${booking}`)
    expect(entry?.detail ?? '').not.toContain('hospital')
  })
})

describe.skipIf(skip !== null)('the ladder, and what it costs (criteria 3 and 4)', () => {
  // Its own member, because the count is what is under test and the cases above have marked one.
  let laddered: TestMember

  beforeAll(async () => {
    if (skip) return
    laddered = await registerMember(app, 'on-the-ladder', generatePassword())
    giveMembership(laddered.id)
  })

  function pastFor(who: TestMember, hoursAgo: number): string {
    return pastBooking(who.id, hoursAgo)
  }

  test('one no-show carries no consequence', async () => {
    await mark(pastFor(laddered, 100))

    const body = await (await send('GET', '/api/rooms/standing', null, laddered.cookie)).json() as
      { count: number, standing: string }
    expect(body.count).toBe(1)
    expect(body.standing).toBe('CLEAR')
  })

  test('the second is recorded', async () => {
    await mark(pastFor(laddered, 101))
    const body = await (await send('GET', '/api/rooms/standing', null, laddered.cookie)).json() as
      { count: number, standing: string }
    expect(body.count).toBe(2)
    expect(body.standing).toBe('RECORDED')
  })

  test('the third sends every booking to the queue, however compliant it is', async () => {
    await mark(pastFor(laddered, 102))

    const body = await (await send('GET', '/api/rooms/standing', null, laddered.cookie)).json() as
      { count: number, standing: string }
    expect(body.standing).toBe('PRE_APPROVAL')

    // A booking that breaks no rule at all, in an ordinary room, weeks out.
    const when = new Date()
    when.setUTCDate(when.getUTCDate() + 21)
    when.setUTCHours(14, 0, 0, 0)

    const booked = await send('POST', '/api/rooms/bookings', {
      roomId: room,
      title: 'Perfectly in policy',
      startsAt: when.toISOString(),
      endsAt: new Date(when.getTime() + 7_200_000).toISOString(),
    }, laddered.cookie)

    expect(booked.status).toBe(422)
    const refusal = await booked.json() as { data: { canRequest: boolean } }
    expect(refusal.data.canRequest).toBe(true)
  })

  test('the request it becomes lands on the approval queue', async () => {
    const when = new Date()
    when.setUTCDate(when.getUTCDate() + 22)
    when.setUTCHours(14, 0, 0, 0)

    const asked = await send('POST', '/api/rooms/requests', {
      roomId: room,
      title: 'Asking instead',
      reason: 'I am on the ladder',
      startsAt: when.toISOString(),
      endsAt: new Date(when.getTime() + 7_200_000).toISOString(),
    }, laddered.cookie)
    expect(asked.status).toBe(200)

    const { id } = await asked.json() as { id: string }
    const queue = await (await send('GET', '/api/admin/rooms/requests', null, officer)).json() as
      { items: { id: string }[] }
    expect(queue.items.some(item => item.id === id)).toBe(true)
  })

  test('withdrawing one takes them back off the ladder', async () => {
    const standing = read<{ id: string }>(
      `SELECT id FROM room_no_shows WHERE user_id = ? AND kind = 'RECORDED' ORDER BY recorded_at DESC LIMIT 1`,
      laddered.id)!

    await send('POST', `/api/admin/rooms/no-shows/${standing.id}/withdraw`,
      { reason: 'Agreed at committee' }, officer)

    const body = await (await send('GET', '/api/rooms/standing', null, laddered.cookie)).json() as
      { count: number, standing: string }
    expect(body.count).toBe(2)
    expect(body.standing).toBe('RECORDED')
  })

  test('and booking works again', async () => {
    const when = new Date()
    when.setUTCDate(when.getUTCDate() + 23)
    when.setUTCHours(14, 0, 0, 0)

    const booked = await send('POST', '/api/rooms/bookings', {
      roomId: room,
      title: 'Back to normal',
      startsAt: when.toISOString(),
      endsAt: new Date(when.getTime() + 7_200_000).toISOString(),
    }, laddered.cookie)
    expect(booked.status).toBe(200)
  })

  test('the numbers are configuration, not code', async () => {
    await send('PUT', '/api/admin/config/ROOM_NO_SHOW_PREAPPROVAL_AT', { value: 2 }, officer)
    try {
      const body = await (await send('GET', '/api/rooms/standing', null, laddered.cookie)).json() as
        { standing: string }
      expect(body.standing).toBe('PRE_APPROVAL')
    }
    finally {
      await send('PUT', '/api/admin/config/ROOM_NO_SHOW_PREAPPROVAL_AT', { value: 3 }, officer)
    }
  })
})

describe.skipIf(skip !== null)('a member sees their own record (criterion 5)', () => {
  test('the count, the standing and what it means, in their own words', async () => {
    const body = await standing()
    expect(body.count).toBeGreaterThan(0)
    expect(body.says).toBeTruthy()
    expect(body.records.length).toBeGreaterThan(0)
  })

  test('withdrawals are shown too, so a correction is visible rather than a gap', async () => {
    const booking = pastBooking()
    const { id } = await (await mark(booking)).json() as { id: string }
    await send('POST', `/api/admin/rooms/no-shows/${id}/withdraw`, { reason: 'Wrong booking' }, officer)

    const body = await (await send('GET', '/api/rooms/standing', null, member.cookie)).json() as
      { records: { kind: string, bookingId: string }[] }
    const about = body.records.filter(one => one.bookingId === booking)
    expect(about.map(one => one.kind).sort()).toEqual(['RECORDED', 'WITHDRAWN'])
  })

  test('nobody reads anybody else s record', async () => {
    const other = await registerMember(app, 'not-mine', generatePassword())
    const body = await (await send('GET', '/api/rooms/standing', null, other.cookie)).json() as
      { count: number, records: unknown[] }
    expect(body.count).toBe(0)
    expect(body.records).toHaveLength(0)
  })

  test('a signed-out visitor reads nothing', async () => {
    expect((await send('GET', '/api/rooms/standing', null, '')).status).toBe(401)
  })
})
