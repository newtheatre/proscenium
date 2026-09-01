import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import { fromLondonWallClock, londonParts } from '#shared/utils/london'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-104. The calendar the old app promised and never built (RM-7). The token in the URL is the
// whole authorisation, so what it does not reach matters as much as what it does.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let member: TestMember
let other: TestMember
let room = ''
const memberPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  officer = admin.cookie
  member = await registerMember(app, 'subscriber', memberPassword)
  other = await registerMember(app, 'somebody-else', generatePassword())
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

async function makeRoom(): Promise<string> {
  const answered = await send('POST', '/api/admin/rooms', { name: `Room ${crypto.randomUUID().slice(0, 8)}` }, officer)
  return (await answered.json() as { id: string }).id
}

// Placed directly, because what is under test is the calendar rather than the booking. A wall
// clock is given, so a case can name the hour it expects to read back.
function placeBooking(userId: string, wall: [number, number, number, number], status = 'CONFIRMED', hours = 2): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  const start = Math.floor(fromLondonWallClock(wall[0], wall[1], wall[2], wall[3]).getTime() / 1000)
  write(
    `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
     VALUES (?, ?, ?, 'Rehearsal', ?, ?, 'GENERAL', ?)`,
    id, room, userId, start, start + hours * 3600, status,
  )
  return id
}

async function mintFeed(as: string): Promise<string> {
  const answered = await send('POST', '/api/account/room-feed', {}, as)
  return (await answered.json() as { url: string }).url
}

// Inside ROOM_FEED_WEEKS, because a feed carries a horizon and a fixture beyond it is invisible.
// The wall clock is what a case asserts, so the date is derived rather than written down.
function weeksAhead(weeks: number, hour = 19): [number, number, number, number] {
  const at = new Date()
  at.setUTCDate(at.getUTCDate() + weeks * 7)
  const { year, month, day } = londonParts(at)
  return [year, month, day, hour]
}

function stamp(wall: [number, number, number, number]): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${wall[0]}${pad(wall[1])}${pad(wall[2])}T${pad(wall[3])}0000`
}

describe.skipIf(skip !== null)('the personal feed (criterion 2)', () => {
  test('a member subscribes and reads their own bookings', async () => {
    const booking = placeBooking(member.id, weeksAhead(2))
    const url = await mintFeed(member.cookie)

    const answered = await fetch(url)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/calendar')

    const calendar = await answered.text()
    expect(calendar).toContain('BEGIN:VCALENDAR')
    expect(calendar).toContain(`UID:booking-${booking}@`)
    expect(calendar).toContain('STATUS:CONFIRMED')
  })

  test('a pending request reads as tentative', async () => {
    placeBooking(member.id, weeksAhead(3), 'PENDING_APPROVAL')
    const calendar = await (await fetch(await mintFeed(member.cookie))).text()
    expect(calendar).toContain('STATUS:TENTATIVE')
  })

  test('a cancelled booking is marked cancelled rather than dropped (criterion 5)', async () => {
    const booking = placeBooking(member.id, weeksAhead(4), 'CANCELLED')
    const calendar = await (await fetch(await mintFeed(member.cookie))).text()

    const event = calendar.split('BEGIN:VEVENT').find(part => part.includes(booking))
    expect(event).toBeDefined()
    expect(event).toContain('STATUS:CANCELLED')
  })

  test('the feed is nobody else s bookings (criterion 3)', async () => {
    const mine = placeBooking(member.id, weeksAhead(5))
    const theirs = placeBooking(other.id, weeksAhead(5, 15))

    const calendar = await (await fetch(await mintFeed(member.cookie))).text()
    expect(calendar).toContain(mine)
    expect(calendar).not.toContain(theirs)
  })

  test('a booking that has finished is not carried forever', async () => {
    const past = placeBooking(member.id, weeksAhead(-8))
    const calendar = await (await fetch(await mintFeed(member.cookie))).text()
    expect(calendar).not.toContain(past)
  })

  // A subscription is polled forever, so the horizon is what stops the file growing without end.
  test('a booking past the feed horizon is not carried either', async () => {
    const distant = placeBooking(member.id, weeksAhead(60))
    const calendar = await (await fetch(await mintFeed(member.cookie))).text()
    expect(calendar).not.toContain(distant)
  })
})

describe.skipIf(skip !== null)('the token (criterion 3)', () => {
  test('regenerating stops the old URL working', async () => {
    const first = await mintFeed(member.cookie)
    expect((await fetch(first)).status).toBe(200)

    const second = await mintFeed(member.cookie)
    expect(second).not.toBe(first)
    expect((await fetch(first)).status).toBe(404)
    expect((await fetch(second)).status).toBe(200)
  })

  test('a token nobody issued is the same answer as a revoked one', async () => {
    expect((await fetch(`${app.baseURL}/rooms/feed/nothingatall/calendar.ics`)).status).toBe(404)
  })

  test('the URL is never readable back, only replaceable', async () => {
    await mintFeed(member.cookie)
    const answered = await send('GET', '/api/account/room-feed', null, member.cookie)
    const body = await answered.json() as { exists: boolean }
    expect(body.exists).toBe(true)
    expect(JSON.stringify(body)).not.toContain('/rooms/feed/')
  })

  test('the plaintext is nowhere in the database', async () => {
    const url = await mintFeed(member.cookie)
    const token = url.split('/rooms/feed/')[1]!.split('/')[0]!
    expect(read<{ id: string }>('SELECT id FROM room_feed_tokens WHERE token_hash = ?', token)).toBeUndefined()
    expect(read<{ n: number }>('SELECT count(*) n FROM room_feed_tokens WHERE user_id = ?', member.id)?.n).toBe(1)
  })

  test('minting one needs an account', async () => {
    expect((await send('POST', '/api/account/room-feed', {}, '')).status).toBe(401)
  })
})

// Both transitions are covered in tests/unit/ics.test.ts, where a date can be named. The horizon
// puts only one half of the year in reach here, so this proves the round trip rather than the rule.
describe.skipIf(skip !== null)('a wall clock survives the round trip (criterion 4)', () => {
  test('a 19:00 booking reads 19:00, whichever half of the year it lands in', async () => {
    const wall = weeksAhead(6)
    placeBooking(member.id, wall)
    const calendar = await (await fetch(await mintFeed(member.cookie))).text()
    expect(calendar).toContain(`DTSTART;TZID=Europe/London:${stamp(wall)}`)
  })

  test('an evening booking never reads as an hour earlier', async () => {
    const wall = weeksAhead(7)
    placeBooking(member.id, wall)
    const calendar = await (await fetch(await mintFeed(member.cookie))).text()
    expect(calendar).not.toContain(`DTSTART;TZID=Europe/London:${stamp([wall[0], wall[1], wall[2], wall[3] - 1])}`)
  })

  test('the zone rule travels with the events', async () => {
    const calendar = await (await fetch(await mintFeed(member.cookie))).text()
    expect(calendar).toContain('BEGIN:VTIMEZONE')
    expect(calendar).toContain('TZID:Europe/London')
  })
})

describe.skipIf(skip !== null)('one booking on its own (criterion 1)', () => {
  test('a confirmed booking downloads as a calendar file', async () => {
    const booking = placeBooking(member.id, weeksAhead(8))
    const answered = await send('GET', `/api/rooms/bookings/${booking}/ics`, null, member.cookie)

    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/calendar')
    expect(answered.headers.get('content-disposition')).toContain('.ics')
    expect(await answered.text()).toContain(`UID:booking-${booking}@`)
  })

  test('somebody else s booking is not there to download', async () => {
    const theirs = placeBooking(other.id, weeksAhead(9))
    expect((await send('GET', `/api/rooms/bookings/${theirs}/ics`, null, member.cookie)).status).toBe(404)
  })

  test('the confirmation email carries the file', async () => {
    const start = new Date()
    start.setUTCDate(start.getUTCDate() + 14)
    start.setUTCHours(12, 0, 0, 0)

    const booked = await send('POST', '/api/rooms/bookings', {
      roomId: room,
      title: 'Read-through',
      purpose: 'REHEARSAL',
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    }, member.cookie)
    expect(booked.status).toBe(200)

    // The mailbox the development transport writes to, which is the only place a message body
    // can be read back: notification_log records the outcome, never the content.
    const files = [...new Bun.Glob('*.txt').scanSync({ cwd: '.data/mail', onlyFiles: true })]
    const recent = await Promise.all(files.map(async name => Bun.file(`.data/mail/${name}`).text()))
    const confirmation = recent.find(body => body.includes('Read-through') && body.includes(member.email))

    expect(confirmation).toBeDefined()
    expect(confirmation).toContain('Attachment: booking.ics')
    expect(confirmation).toContain('BEGIN:VCALENDAR')
  })
})

describe.skipIf(skip !== null)('the screen (C-104)', () => {
  test('a member mints the link from their own bookings page, and it works', async () => {
    placeBooking(member.id, weeksAhead(10))

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', memberPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`)

      await visit(view, `${app.baseURL}/rooms/mine`, '[data-test="feed-card"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, '[data-test="feed-mint"]')
      await waitFor(view, `document.querySelector('[data-test="feed-url"]')`, 30_000)

      const url = await view.evaluate<string>(`document.querySelector('[data-test="feed-url"]').value`)
      expect(url).toContain('/rooms/feed/')
      expect((await fetch(url)).status).toBe(200)
    }
    finally {
      view.close()
    }
  }, 120_000)
})
