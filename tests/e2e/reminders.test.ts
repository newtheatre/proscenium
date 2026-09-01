import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { fromLondonWallClock, londonParts } from '#shared/utils/london'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-113. The old app had no clockwork at all, so nothing was ever reminded and no failed send was
// ever visible (RM-1). Criterion 3 asks for a scheduled-job test by name.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let officerId = ''
let member: TestMember
let other: TestMember
let room = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  officer = admin.cookie
  officerId = admin.id
  member = await registerMember(app, 'reminded', generatePassword())
  other = await registerMember(app, 'also-reminded', generatePassword())
  giveMembership(member.id)
  giveMembership(other.id)
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

// Tomorrow in London, which is the day the reminder covers, at the hour asked for (0014).
function tomorrowAt(hour: number): number {
  const { year, month, day } = londonParts(new Date())
  return Math.floor(fromLondonWallClock(year, month, day + 1, hour).getTime() / 1000)
}

function placeBooking(userId: string, startsAt: number, status = 'CONFIRMED', title = 'Rehearsal'): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  write(
    `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
     VALUES (?, ?, ?, ?, ?, ?, 'GENERAL', ?)`,
    id, room, userId, title, startsAt, startsAt + 7200, status,
  )
  return id
}

const remind = (): Promise<Response> => send('POST', '/api/dev/remind-rooms', {}, officer)

function sentTo(userId: string, type: string): number {
  return read<{ n: number }>(
    'SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = ?', userId, type)?.n ?? 0
}

function suppressedFor(userId: string, type: string): number {
  return read<{ n: number }>(
    `SELECT count(*) n FROM notification_log
     WHERE user_id = ? AND type = ? AND status = 'SKIPPED_UNDELIVERABLE'`, userId, type)?.n ?? 0
}

function clearReminders(): void {
  write(`DELETE FROM notification_log WHERE type = 'room.booking.reminder'`)
}

describe.skipIf(skip !== null)('the day-before reminder (criterion 3)', () => {
  test('a confirmed booking tomorrow is reminded', async () => {
    clearReminders()
    placeBooking(member.id, tomorrowAt(19))

    const answered = await remind()
    expect(answered.status).toBe(200)
    expect((await answered.json() as { members: number }).members).toBeGreaterThan(0)
    expect(sentTo(member.id, 'room.booking.reminder')).toBe(1)
  })

  test('the reminder carries the calendar file', async () => {
    clearReminders()
    placeBooking(member.id, tomorrowAt(18), 'CONFIRMED', 'Dress run')
    await remind()

    const files = [...new Bun.Glob('*.txt').scanSync({ cwd: '.data/mail', onlyFiles: true })]
    const bodies = await Promise.all(files.map(name => Bun.file(`.data/mail/${name}`).text()))
    const reminder = bodies.find(body => body.includes('Dress run') && body.includes(member.email))

    expect(reminder).toBeDefined()
    expect(reminder).toContain('Attachment: tomorrow.ics')
    expect(reminder).toContain('BEGIN:VCALENDAR')
  })

  test('a booking further out than tomorrow is not', async () => {
    clearReminders()
    placeBooking(other.id, tomorrowAt(19) + 3 * 86_400)

    await remind()
    expect(sentTo(other.id, 'room.booking.reminder')).toBe(0)
  })

  test('a cancelled booking is not reminded about', async () => {
    clearReminders()
    placeBooking(other.id, tomorrowAt(11), 'CANCELLED')

    await remind()
    expect(sentTo(other.id, 'room.booking.reminder')).toBe(0)
  })

  test('a request still waiting is not reminded about either', async () => {
    clearReminders()
    placeBooking(other.id, tomorrowAt(12), 'PENDING_APPROVAL')

    await remind()
    expect(sentTo(other.id, 'room.booking.reminder')).toBe(0)
  })

  // The task runs on a schedule nobody controls, so a second run in the same day must not send
  // a second time.
  test('running it twice reminds once', async () => {
    clearReminders()
    placeBooking(member.id, tomorrowAt(20))

    await remind()
    const second = await remind()

    expect((await second.json() as { skipped: number }).skipped).toBeGreaterThan(0)
    expect(sentTo(member.id, 'room.booking.reminder')).toBe(1)
  })
})

describe.skipIf(skip !== null)('changes coalesce per member (criterion 2)', () => {
  test('three rooms tomorrow are one message, not three', async () => {
    clearReminders()
    placeBooking(member.id, tomorrowAt(9))
    placeBooking(member.id, tomorrowAt(13))
    placeBooking(member.id, tomorrowAt(16))

    const answered = await remind()
    const run = await answered.json() as { members: number, bookings: number }

    expect(run.bookings).toBeGreaterThanOrEqual(3)
    expect(sentTo(member.id, 'room.booking.reminder')).toBe(1)
  })

  test('two members each get their own', async () => {
    clearReminders()
    placeBooking(member.id, tomorrowAt(10))
    placeBooking(other.id, tomorrowAt(14))

    await remind()
    expect(sentTo(member.id, 'room.booking.reminder')).toBe(1)
    expect(sentTo(other.id, 'room.booking.reminder')).toBe(1)
  })
})

describe.skipIf(skip !== null)('a request tells the approvers when it arrives (criterion 4)', () => {
  // Inside the notice window, so the policy will not confirm it and a request is the only way.
  function soon(): { startsAt: string, endsAt: string } {
    const start = new Date()
    start.setUTCDate(start.getUTCDate() + 1)
    start.setUTCHours(10, 0, 0, 0)
    return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString() }
  }

  test('an approver is told as soon as one is raised', async () => {
    // Its own room: the cases above fill tomorrow in the shared one, and a request for a taken
    // slot is a conflict rather than a request.
    const quiet = await makeRoom()
    const before = sentTo(officerId, 'room.request.raised')
    const asked = await send('POST', '/api/rooms/requests', {
      roomId: quiet,
      title: 'Understudy call',
      purpose: 'REHEARSAL',
      reason: 'The principal is ill and we have two days',
      ...soon(),
    }, member.cookie)
    expect(asked.status).toBe(200)

    expect(sentTo(officerId, 'room.request.raised') - before).toBe(1)
  })

  // A muted inbox must not lose a request: the queue is the backstop, so the request has to be
  // standing on it whether or not anybody was emailed.
  test('a muted approver still finds the request on the queue', async () => {
    write(
      `INSERT INTO notification_preferences (user_id, topic, email, push) VALUES (?, 'ROOMS', 0, 0)
       ON CONFLICT (user_id, topic) DO UPDATE SET email = 0, push = 0`,
      officerId,
    )
    const before = sentTo(officerId, 'room.request.raised')
    const suppressedBefore = suppressedFor(officerId, 'room.request.raised')

    const quiet = await makeRoom()
    const asked = await send('POST', '/api/rooms/requests', {
      roomId: quiet,
      title: 'Muted call',
      purpose: 'REHEARSAL',
      reason: 'Nobody will be emailed about this one',
      ...soon(),
    }, member.cookie)
    const { id } = await asked.json() as { id: string }

    // Counted rather than ordered: created_at is whole seconds, so two sends in the same second
    // leave "the latest row" ambiguous. Logged as suppressed rather than sent (criterion 5).
    expect(suppressedFor(officerId, 'room.request.raised')).toBe(suppressedBefore + 1)
    expect(sentTo(officerId, 'room.request.raised')).toBe(before + 1)

    const queue = await (await send('GET', '/api/admin/rooms/requests', null, officer)).json() as { items: { id: string }[] }
    expect(queue.items.some(item => item.id === id)).toBe(true)

    write(`UPDATE notification_preferences SET email = 1, push = 1 WHERE user_id = ? AND topic = 'ROOMS'`, officerId)
  })
})

describe.skipIf(skip !== null)('a send that did not arrive is visible (criterion 5)', () => {
  test('the overview lists what was suppressed, with who and why', async () => {
    write(
      `INSERT INTO notification_log (id, user_id, type, channel, status, error)
       VALUES (?, ?, 'room.booking.confirmed', 'EMAIL', 'FAILED', 'the provider refused it')`,
      crypto.randomUUID().replaceAll('-', ''), member.id,
    )

    const answered = await send('GET', '/api/admin/notifications/trouble', null, officer)
    expect(answered.status).toBe(200)

    const body = await answered.json() as { items: { status: string, who: string | null, error: string | null }[] }
    const failure = body.items.find(item => item.status === 'FAILED')
    expect(failure).toBeDefined()
    expect(failure!.who).toBe(member.name)
    expect(failure!.error).toBe('the provider refused it')
  })

  test('a send that arrived is not on the list', async () => {
    const body = await (await send('GET', '/api/admin/notifications/trouble', null, officer)).json() as { items: { status: string }[] }
    expect(body.items.every(item => item.status !== 'SENT')).toBe(true)
  })

  test('a member cannot read it', async () => {
    expect((await send('GET', '/api/admin/notifications/trouble', null, member.cookie)).status).toBe(403)
  })
})
