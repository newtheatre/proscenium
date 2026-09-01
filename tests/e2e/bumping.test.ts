import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-115. The old app published a priority order and never enforced it, so who got a room was
// settled by argument (RM-1). Bumping is an officer's act with a reason, never automatic.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let officerId = ''
let member: TestMember
let claimant: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  officer = admin.cookie
  officerId = admin.id
  member = await registerMember(app, 'displaced', generatePassword())
  claimant = await registerMember(app, 'claimant', generatePassword())
  giveMembership(member.id)
  giveMembership(claimant.id)
  giveMembership(admin.id)

  // This suite books the same member over and over. The cap has its own tests.
  await send('PUT', '/api/admin/config/ROOM_ACTIVE_BOOKINGS_PER_MEMBER', { value: 500 }, officer)
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

function span(daysAhead: number, hour = 14, hours = 2): { startsAt: string, endsAt: string } {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + daysAhead)
  start.setUTCHours(hour, 0, 0, 0)
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString() }
}

async function bookAs(roomId: string, when: { startsAt: string, endsAt: string }, who: TestMember, tier = 'GENERAL'): Promise<string> {
  const answered = await send('POST', '/api/rooms/bookings', { roomId, title: 'Rehearsal', purpose: 'REHEARSAL', tier, ...when }, who.cookie)
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const bump = (id: string, over: Record<string, unknown> = {}, as = officer): Promise<Response> =>
  send('POST', `/api/admin/rooms/bookings/${id}/bump`, {
    userId: claimant.id,
    title: 'Dress run',
    purpose: 'REHEARSAL',
    tier: 'PRODUCTION',
    reason: 'Show week for the autumn production',
    ...over,
  }, as)

describe.skipIf(skip !== null)('only a higher tier may bump (criterion 2)', () => {
  test('a production takes a general booking, and the room changes hands', async () => {
    const room = await makeRoom()
    const when = span(30)
    const booking = await bookAs(room, when, member)

    const answered = await bump(booking)
    expect(answered.status).toBe(200)

    const body = await answered.json() as { replacementId: string }
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status).toBe('BUMPED')

    const replacement = read<{ user_id: string, tier: string, starts_at: number }>(
      'SELECT user_id, tier, starts_at FROM room_bookings WHERE id = ?', body.replacementId)
    expect(replacement?.user_id).toBe(claimant.id)
    expect(replacement?.tier).toBe('PRODUCTION')
  })

  test('an equal tier is refused, and the booking stands', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(31), member, 'REHEARSAL')

    const answered = await bump(booking, { tier: 'REHEARSAL' })
    expect(answered.status).toBe(422)
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status).toBe('CONFIRMED')
  })

  test('a lower tier is refused', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(32), member, 'PRODUCTION')
    expect((await bump(booking, { tier: 'GENERAL' })).status).toBe(422)
  })

  test('a pending request cannot be bumped', async () => {
    const room = await makeRoom({ sensitive: true })
    const asked = await send('POST', '/api/rooms/requests', {
      roomId: room,
      title: 'Waiting',
      purpose: 'REHEARSAL',
      reason: 'Sensitive rooms always ask',
      ...span(33),
    }, member.cookie)
    const { id } = await asked.json() as { id: string }

    expect((await bump(id)).status).toBe(422)
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', id)?.status)
      .toBe('PENDING_APPROVAL')
  })

  test('a bumped booking cannot be bumped again', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(34), member)
    await bump(booking)
    expect((await bump(booking)).status).toBe(422)
  })

  test('a reason is required', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(35), member)
    expect((await bump(booking, { reason: '' })).status).toBe(400)
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status).toBe('CONFIRMED')
  })

  test('nothing bumps automatically: a member booking over one is still refused', async () => {
    const room = await makeRoom()
    const when = span(36)
    await bookAs(room, when, member)

    const over = await send('POST', '/api/rooms/bookings',
      { roomId: room, title: 'Higher claim', purpose: 'REHEARSAL', tier: 'PRODUCTION', ...when }, claimant.cookie)
    expect(over.status).toBe(409)
  })

  test('a member cannot bump anybody', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(37), member)
    expect((await bump(booking, {}, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the displaced member is told and offered a slot (criterion 3)', () => {
  test('a replacement is held for them, not merely suggested', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(40), member)

    const body = await (await bump(booking)).json() as { offered: { id: string, room: string } | null }
    expect(body.offered).not.toBeNull()

    const held = read<{ user_id: string, status: string, notes: string }>(
      'SELECT user_id, status, notes FROM room_bookings WHERE id = ?', body.offered!.id)
    expect(held?.user_id).toBe(member.id)
    expect(held?.status).toBe('CONFIRMED')
    expect(held?.notes).toContain('bumped')
  })

  test('the bumped row links to what replaced it', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(41), member)
    const body = await (await bump(booking)).json() as { offered: { id: string } | null }

    const bumped = read<{ bumped_to_booking_id: string, bumped_reason: string }>(
      'SELECT bumped_to_booking_id, bumped_reason FROM room_bookings WHERE id = ?', booking)
    expect(bumped?.bumped_to_booking_id).toBe(body.offered!.id)
    expect(bumped?.bumped_reason).toContain('Show week')
  })

  test('they are told at once, with the reason', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(42), member)

    const before = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'room.booking.bumped'`,
      member.id)?.n ?? 0
    await bump(booking, { reason: 'The get-in moved' })

    expect((read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'room.booking.bumped'`,
      member.id)?.n ?? 0) - before).toBe(1)

    const files = [...new Bun.Glob('*.txt').scanSync({ cwd: '.data/mail', onlyFiles: true })]
    const bodies = await Promise.all(files.map(name => Bun.file(`.data/mail/${name}`).text()))
    const message = bodies.find(body => body.includes('The get-in moved') && body.includes(member.email))
    expect(message).toBeDefined()
  })

  test('the offer is never a slot somebody else holds', async () => {
    const room = await makeRoom()
    const when = span(43)
    const booking = await bookAs(room, when, member)

    const body = await (await bump(booking)).json() as { offered: { id: string, startsAt: number } | null }
    const clashes = read<{ n: number }>(
      `SELECT count(*) n FROM room_bookings
       WHERE id <> ? AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
         AND room_id = (SELECT room_id FROM room_bookings WHERE id = ?)
         AND starts_at < (SELECT ends_at FROM room_bookings WHERE id = ?)
         AND ends_at > (SELECT starts_at FROM room_bookings WHERE id = ?)`,
      body.offered!.id, body.offered!.id, body.offered!.id, body.offered!.id)
    expect(clashes?.n).toBe(0)
  })

  test('the offer is never inside a closure', async () => {
    const room = await makeRoom()
    const when = span(44)
    const booking = await bookAs(room, when, member)

    // Everything around the booking is shut, but not the booking itself, so the room has no
    // free day left to offer and the search must look elsewhere.
    const from = new Date(when.startsAt)
    const to = new Date(when.endsAt)
    for (const closure of [
      { startsAt: new Date(from.getTime() - 20 * 86_400_000), endsAt: new Date(from.getTime() - 60_000) },
      { startsAt: new Date(to.getTime() + 60_000), endsAt: new Date(to.getTime() + 20 * 86_400_000) },
    ]) {
      const answered = await send('POST', '/api/admin/rooms/blackouts', {
        roomId: room,
        reason: 'Refurbishment',
        startsAt: closure.startsAt.toISOString(),
        endsAt: closure.endsAt.toISOString(),
      }, officer)
      expect(answered.status).toBe(200)
    }

    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status)
      .toBe('CONFIRMED')

    const body = await (await bump(booking)).json() as { offered: { id: string } | null }
    if (body.offered) {
      const where = read<{ room_id: string }>('SELECT room_id FROM room_bookings WHERE id = ?', body.offered.id)
      expect(where?.room_id).not.toBe(room)
    }
  })

  // Capacity 400 excludes every other room in the suite, which has none recorded, so the search
  // is confined to this one and can be emptied.
  test('when nothing equivalent is free, the bump still goes ahead with no offer', async () => {
    const room = await makeRoom({ capacity: 400 })
    const when = span(45)
    const booking = await bookAs(room, when, member)

    // Every nearby slot in the only room big enough is taken, so nothing can be offered.
    for (let day = -14; day <= 14; day++) {
      if (day === 0) continue
      const at = new Date(new Date(when.startsAt).getTime() + day * 86_400_000)
      write(
        `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
         VALUES (?, ?, ?, 'Blocking the offers', ?, ?, 'GENERAL', 'CONFIRMED')`,
        crypto.randomUUID().replaceAll('-', ''), room, officerId,
        Math.floor(at.getTime() / 1000), Math.floor(at.getTime() / 1000) + 7200,
      )
    }

    const answered = await bump(booking)
    expect(answered.status).toBe(200)
    expect((await answered.json() as { offered: unknown }).offered).toBeNull()
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status).toBe('BUMPED')
  })

  test('an officer can see where a booking could go before bumping it', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(46), member)

    const answered = await send('GET', `/api/admin/rooms/bookings/${booking}/alternatives`, null, officer)
    expect(answered.status).toBe(200)

    const body = await answered.json() as { nearest: { roomId: string } | null, total: number }
    expect(body.total).toBeGreaterThan(0)
    // The same room first, which is what "equivalent" means to somebody moving a rehearsal.
    expect(body.nearest?.roomId).toBe(room)
  })
})

describe.skipIf(skip !== null)('a bump is not a cancellation (criterion 4)', () => {
  test('BUMPED is its own status and the row survives', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(50), member)
    await bump(booking)

    const row = read<{ status: string, title: string }>(
      'SELECT status, title FROM room_bookings WHERE id = ?', booking)
    expect(row?.status).toBe('BUMPED')
    expect(row?.title).toBe('Rehearsal')
  })

  test('the member sees it on their own list, with the reason', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(51), member)
    await bump(booking, { reason: 'The auditorium is needed for a get-in' })

    const listing = await (await send('GET', '/api/rooms/bookings?when=upcoming', null, member.cookie))
      .json() as { items: { id: string, status: string, bumpedReason: string | null }[] }
    const mine = listing.items.find(item => item.id === booking)

    expect(mine?.status).toBe('BUMPED')
    expect(mine?.bumpedReason).toBe('The auditorium is needed for a get-in')
  })

  test('a bumped booking cannot be cancelled by its member: it is already decided', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(52), member)
    await bump(booking)

    const answered = await send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie)
    expect(answered.status).toBe(409)
  })

  test('the slot it held is free for the claimant and nobody else', async () => {
    const room = await makeRoom()
    const when = span(53)
    const booking = await bookAs(room, when, member)
    await bump(booking)

    // The claimant holds it now, so a third member is refused.
    const third = await send('POST', '/api/rooms/bookings', { roomId: room, title: 'Me too', purpose: 'REHEARSAL', ...when }, member.cookie)
    expect(third.status).toBe(409)
  })
})

describe.skipIf(skip !== null)('every bump is on the trail (criterion 5)', () => {
  test('the actor, the reason and both bookings are recorded', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(55), member)
    const body = await (await bump(booking)).json() as { replacementId: string, offered: { id: string } | null }

    // Filtered by action: booking it wrote an entry against the same target already.
    const entry = read<{ actor_id: string, action: string, detail: string }>(
      `SELECT actor_id, action, detail FROM audit_log WHERE target = ? AND action = 'room.booking.bumped'`,
      `booking:${booking}`)

    expect(entry?.action).toBe('room.booking.bumped')
    expect(entry?.actor_id).toBe(officerId)
    expect(entry?.detail).toContain(body.replacementId)
    expect(entry?.detail).toContain(body.offered!.id)
  })

  test('the reason the officer gave stays out of the trail', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(56), member)
    await bump(booking, { reason: 'A private matter about a member' })

    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE target = ? AND action = 'room.booking.bumped'`, `booking:${booking}`)
    expect(entry?.detail ?? '').not.toContain('A private matter')
  })
})

describe.skipIf(skip !== null)('two officers bumping the same booking (criterion 2)', () => {
  // An in-process SQLite serialises writes, so this proves the slot changes hands once rather
  // than that the batch is atomic under D1 (0022).
  test('the room changes hands once, not twice', async () => {
    const room = await makeRoom()
    const booking = await bookAs(room, span(57), member)

    const answers = await Promise.all([bump(booking), bump(booking), bump(booking)])
    const won = answers.filter(answer => answer.status === 200)

    expect(won).toHaveLength(1)
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status).toBe('BUMPED')

    const inSlot = read<{ n: number }>(
      `SELECT count(*) n FROM room_bookings
       WHERE room_id = ? AND status = 'CONFIRMED'
         AND starts_at = (SELECT starts_at FROM room_bookings WHERE id = ?)`, room, booking)
    expect(inSlot?.n).toBe(1)
  })
})
