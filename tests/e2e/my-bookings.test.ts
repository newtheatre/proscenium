import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-112, and the member half of C-113. A booking that cannot be cancelled is a booking that has
// to be emailed about, which is what this story exists to end.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let member: TestMember
let memberPassword = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  officer = admin.cookie

  memberPassword = generatePassword()
  member = await registerMember(app, 'holder', memberPassword)
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

// Placed directly, because what is under test is the cancelling rather than the booking. Midday,
// so the London day and the UTC day cannot disagree about which day it is on (0014).
function placeBooking(roomId: string, userId: string, daysAhead: number, status = 'CONFIRMED'): { id: string, day: string } {
  const id = crypto.randomUUID().replaceAll('-', '')
  const at = new Date()
  at.setUTCDate(at.getUTCDate() + daysAhead)
  at.setUTCHours(12, 0, 0, 0)

  const start = Math.floor(at.getTime() / 1000)
  write(
    `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
     VALUES (?, ?, ?, 'Rehearsal', ?, ?, 'GENERAL', ?)`,
    id, roomId, userId, start, start + 7200, status,
  )
  return { id, day: at.toISOString().slice(0, 10) }
}

interface Listing { items: { id: string, status: string, cancellable: boolean }[], total: number }

const mine = async (as: string, when = 'upcoming'): Promise<Listing> =>
  await (await send('GET', `/api/rooms/bookings?when=${when}`, undefined, as)).json() as Listing

describe.skipIf(skip !== null)('the bookings a member holds (C-112)', () => {
  test('what they hold is listed, and what somebody else holds is not', async () => {
    const room = await makeRoom()
    const stranger = await registerMember(app, 'stranger', generatePassword())
    const ours = placeBooking(room, member.id, 3).id
    placeBooking(room, stranger.id, 4)

    const listed = await mine(member.cookie)
    expect(listed.items.map(booking => booking.id)).toEqual([ours])
  })

  test('a past booking stays visible, on the other tab', async () => {
    const room = await makeRoom()
    const over = placeBooking(room, member.id, -10).id

    expect((await mine(member.cookie)).items.map(booking => booking.id)).not.toContain(over)
    expect((await mine(member.cookie, 'past')).items.map(booking => booking.id)).toContain(over)
  })

  // Criterion 2: a status change, and no delete path exists for a member at all.
  test('cancelling keeps the row and changes its status', async () => {
    const room = await makeRoom()
    const booking = placeBooking(room, member.id, 5).id

    expect((await send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie)).status).toBe(200)

    const row = read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)
    expect(row?.status).toBe('CANCELLED')
  })

  test('the slot frees the moment it is cancelled', async () => {
    const room = await makeRoom()
    const { id: booking, day } = placeBooking(room, member.id, 6)

    const before = await (await send('GET', `/api/rooms/availability?from=${day}&to=${day}&roomId=${room}`, undefined, member.cookie)).json() as { rooms: { taken: unknown[] }[] }
    expect(before.rooms[0]?.taken.length).toBeGreaterThan(0)

    await send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie)

    const after = await (await send('GET', `/api/rooms/availability?from=${day}&to=${day}&roomId=${room}`, undefined, member.cookie)).json() as { rooms: { taken: unknown[] }[] }
    expect(after.rooms[0]?.taken).toEqual([])
  })

  test('a request waiting on a decision may be withdrawn', async () => {
    const room = await makeRoom()
    const booking = placeBooking(room, member.id, 7, 'PENDING_APPROVAL').id
    expect((await send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie)).status).toBe(200)
  })

  // Criterion 5: terminal, and still in the history.
  test('cancelling twice is refused, and the booking stays in the list', async () => {
    const room = await makeRoom()
    const booking = placeBooking(room, member.id, 8).id

    await send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie)
    expect((await send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie)).status).toBe(409)
    expect((await mine(member.cookie)).items.map(one => one.id)).toContain(booking)
  })

  test('somebody else\'s booking cannot be cancelled, and the refusal does not confirm it exists', async () => {
    const room = await makeRoom()
    const stranger = await registerMember(app, 'not-mine', generatePassword())
    const theirs = placeBooking(room, stranger.id, 9).id

    const refused = await send('POST', `/api/rooms/bookings/${theirs}/cancel`, {}, member.cookie)
    expect(refused.status).toBe(404)
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', theirs)?.status).toBe('CONFIRMED')
  })

  test('a booking nobody has is the same answer as one that is not yours', async () => {
    expect((await send('POST', '/api/rooms/bookings/not-a-booking/cancel', {}, member.cookie)).status).toBe(404)
  })

  // Two cancels racing must not both count as the one that freed the slot.
  test('two simultaneous cancels leave one success', async () => {
    const room = await makeRoom()
    const booking = placeBooking(room, member.id, 11).id

    const answers = await Promise.all([
      send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie),
      send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie),
    ])
    expect(answers.filter(answer => answer.status === 200)).toHaveLength(1)
  })
})

describe.skipIf(skip !== null)('being told (C-113, the member half)', () => {
  test('a confirmed booking sends a confirmation', async () => {
    const room = await makeRoom()
    const soon = new Date()
    soon.setDate(soon.getDate() + 6)
    soon.setHours(14, 0, 0, 0)

    await send('POST', '/api/rooms/bookings', {
      roomId: room,
      title: 'Rehearsal',
      startsAt: soon.toISOString(),
      endsAt: new Date(soon.getTime() + 2 * 3_600_000).toISOString(),
    }, member.cookie)

    const sent = read<{ n: number }>(`
      SELECT count(*) n FROM notification_log l JOIN users u ON u.id = l.user_id
      WHERE u.email = ? AND l.type = 'room.booking.confirmed'`, member.email)
    expect(sent?.n).toBeGreaterThan(0)
  })

  test('cancelling sends one too', async () => {
    const room = await makeRoom()
    const booking = placeBooking(room, member.id, 12).id
    await send('POST', `/api/rooms/bookings/${booking}/cancel`, {}, member.cookie)

    const sent = read<{ n: number }>(`
      SELECT count(*) n FROM notification_log l JOIN users u ON u.id = l.user_id
      WHERE u.email = ? AND l.type = 'room.booking.cancelled'`, member.email)
    expect(sent?.n).toBeGreaterThan(0)
  })
})

describe.skipIf(skip !== null)('the screen (C-112)', () => {
  test('a member cancels from the page, and the row stays with its new status', async () => {
    const room = await makeRoom()
    const booking = placeBooking(room, member.id, 13).id

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', memberPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`)

      await visit(view, `${app.baseURL}/rooms/mine`, '[data-test="mine-list"]')
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, `[data-test="cancel-${booking}"]`)
      await waitFor(view, `document.querySelector('[data-test="cancel-confirm"]')`, 30_000)
      await click(view, '[data-test="cancel-confirm"]')

      // This row's own cancel button, not the word anywhere on the page: earlier cases in this
      // suite cancelled bookings for the same member, so "Cancelled" is already on screen.
      await waitFor(view, `!document.querySelector('[data-test="cancel-${booking}"]')`, 30_000)
      expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', booking)?.status)
        .toBe('CANCELLED')
    }
    finally {
      view.close()
    }
  }, 120_000)
})
