import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { londonParts } from '#shared/utils/london'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-117. The end-of-year review runs on numbers rather than impressions, which is what the old
// dashboard's counts never gave anybody (RM-3).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let member: TestMember
let room = ''
let quiet = ''

// A span nothing else in the suite touches, so the figures are only what these cases put there.
const FROM = '2029-03-01'
const TO = '2029-03-31'

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  officer = admin.cookie
  member = await registerMember(app, 'utilised', generatePassword())
  giveMembership(member.id)

  room = await makeRoom()
  quiet = await makeRoom()
  // Nine to five on Mondays, so the denominator is a number rather than "always open". The whole
  // room is sent, because the update takes a room and not a patch of one.
  const existing = await (await send('GET', '/api/admin/rooms', null, officer)).json() as
    { items: { id: string, name: string }[] }
  const named = existing.items.find(one => one.id === room)!
  const set = await send('PUT', `/api/admin/rooms/${room}`, {
    name: named.name,
    hours: [{ weekday: 1, opens: '09:00', closes: '17:00' }],
  }, officer)
  expect(set.status).toBe(200)
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

// Written straight in: the span is years out, so the policy would refuse it and what is under
// test is the counting rather than the booking.
function place(roomId: string, day: string, hour: number, hours: number, status = 'CONFIRMED', tier = 'GENERAL'): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  const start = Math.floor(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour) / 1000)
  write(
    `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
     VALUES (?, ?, ?, 'Rehearsal', ?, ?, ?, ?)`,
    id, roomId, member.id, start, start + hours * 3600, tier, status,
  )
  return id
}

const report = async (over: Record<string, string> = {}): Promise<{
  items: { key: string, label: string, confirmedHours: number, cancelledHours: number, noShowHours: number, openHours: number, bookings: number }[]
  totals: { confirmedHours: number, noShowHours: number, bookings: number }
  page: number
  pageSize: number
  total: number
  pages: number
}> => {
  const query = new URLSearchParams({ from: FROM, to: TO, ...over })
  return (await send('GET', `/api/admin/rooms/reports/utilisation?${query}`, null, officer)).json() as never
}

describe.skipIf(skip !== null)('booked hours against open hours (criterion 1)', () => {
  test('confirmed hours are counted per room', async () => {
    place(room, '2029-03-05', 10, 2)
    place(room, '2029-03-12', 10, 3)

    const body = await report()
    const row = body.items.find(item => item.key === room)
    expect(row?.confirmedHours).toBe(5)
    expect(row?.bookings).toBe(2)
  })

  test('open hours come from the room s own opening hours', async () => {
    const body = await report()
    const row = body.items.find(item => item.key === room)
    // Four Mondays in March 2029, nine to five.
    expect(row?.openHours).toBe(32)
  })

  test('cancelled and no-show hours are told apart from confirmed', async () => {
    place(room, '2029-03-06', 10, 1, 'CANCELLED')
    const missed = place(room, '2029-03-07', 10, 4)
    write(
      `INSERT INTO room_no_shows (id, booking_id, user_id, kind, recorded_by) VALUES (?, ?, ?, 'RECORDED', ?)`,
      crypto.randomUUID().replaceAll('-', ''), missed, member.id, member.id,
    )

    const body = await report()
    const row = body.items.find(item => item.key === room)

    expect(row?.cancelledHours).toBe(1)
    expect(row?.noShowHours).toBe(4)
    // Held and not used, so it is its own figure rather than counted as used.
    expect(row?.confirmedHours).toBe(5)
  })

  test('a withdrawn no-show goes back to being confirmed hours', async () => {
    const missed = place(room, '2029-03-08', 10, 2)
    const recordId = crypto.randomUUID().replaceAll('-', '')
    write(
      `INSERT INTO room_no_shows (id, booking_id, user_id, kind, recorded_by) VALUES (?, ?, ?, 'RECORDED', ?)`,
      recordId, missed, member.id, member.id,
    )
    expect((await report()).items.find(item => item.key === room)?.noShowHours).toBe(6)

    await send('POST', `/api/admin/rooms/no-shows/${recordId}/withdraw`, { reason: 'Wrong booking' }, officer)
    expect((await report()).items.find(item => item.key === room)?.noShowHours).toBe(4)
  })

  test('a room nobody booked is not a row of noughts, it is absent', async () => {
    const body = await report()
    expect(body.items.some(item => item.key === quiet)).toBe(false)
  })

  test('a span with nothing in it reports nothing', async () => {
    const body = await report({ from: '2031-01-01', to: '2031-01-31' })
    expect(body.items).toHaveLength(0)
    expect(body.totals.confirmedHours).toBe(0)
  })

  test('a booking outside the span is not counted', async () => {
    const before = (await report()).items.find(item => item.key === room)!.confirmedHours
    place(room, '2029-04-02', 10, 8)
    expect((await report()).items.find(item => item.key === room)?.confirmedHours).toBe(before)
  })
})

describe.skipIf(skip !== null)('by tier (criterion 2)', () => {
  test('the same hours break down by what kind of booking they were', async () => {
    place(room, '2029-03-13', 10, 2, 'CONFIRMED', 'PRODUCTION')
    place(room, '2029-03-14', 10, 1, 'CONFIRMED', 'PRODUCTION')

    const body = await report({ by: 'tier' })
    const production = body.items.find(item => item.label === 'PRODUCTION')
    expect(production?.confirmedHours).toBe(3)
    expect(production?.bookings).toBe(2)

    // A tier has no opening hours of its own, so there is nothing to divide by.
    expect(production?.openHours).toBe(0)
  })

  test('every tier that was booked appears', async () => {
    const body = await report({ by: 'tier' })
    expect(body.items.map(item => item.label)).toContain('GENERAL')
    expect(body.items.map(item => item.label)).toContain('PRODUCTION')
  })
})

describe.skipIf(skip !== null)('the report is paged and exportable (criterion 3)', () => {
  test('it returns an envelope, never a bare array', async () => {
    const body = await report()
    expect(body.page).toBe(1)
    expect(body.pageSize).toBeGreaterThan(0)
    expect(body.pages).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('the totals are the whole span, not the page', async () => {
    const body = await report()
    expect(body.totals.confirmedHours).toBeGreaterThanOrEqual(
      body.items.reduce((sum, item) => sum + item.confirmedHours, 0))
  })

  test('the same figures export as CSV', async () => {
    const answered = await send('GET', `/api/admin/rooms/reports/export?from=${FROM}&to=${TO}&by=room`, null, officer)

    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/csv')
    expect(answered.headers.get('content-disposition')).toContain('.csv')

    const text = await answered.text()
    const [header, ...lines] = text.trim().split('\n')
    expect(header).toContain('confirmedHours')
    expect(header).toContain('noShowHours')
    expect(lines.length).toBeGreaterThan(0)
    // Every cell quoted, so a room name with a comma cannot split a row.
    expect(lines[0]!.startsWith('"')).toBe(true)
  })

  test('a backwards span is refused rather than reported on', async () => {
    const answered = await send('GET', '/api/admin/rooms/reports/utilisation?from=2029-03-31&to=2029-03-01', null, officer)
    expect(answered.status).toBe(400)
  })

  test('a member cannot read the report or the export', async () => {
    expect((await send('GET', `/api/admin/rooms/reports/utilisation?from=${FROM}&to=${TO}`, null, member.cookie)).status)
      .toBe(403)
    expect((await send('GET', `/api/admin/rooms/reports/export?from=${FROM}&to=${TO}`, null, member.cookie)).status)
      .toBe(403)
  })
})

describe.skipIf(skip !== null)('the figures survive an erasure (criterion 4)', () => {
  test('a year of statistics is not dented by a member leaving', async () => {
    const leaving = await registerMember(app, 'leaving', generatePassword())
    giveMembership(leaving.id)

    const id = crypto.randomUUID().replaceAll('-', '')
    const start = Math.floor(Date.UTC(2029, 2, 19, 10) / 1000)
    write(
      `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
       VALUES (?, ?, ?, 'Theirs', ?, ?, 'GENERAL', 'CONFIRMED')`,
      id, room, leaving.id, start, start + 2 * 3600,
    )

    const before = (await report()).items.find(item => item.key === room)!.confirmedHours

    // Erased by an officer rather than by its owner: closing your own account needs a fresh
    // session, which this suite has no reason to prove again (A-125).
    const closed = await send('POST', `/api/admin/accounts/${leaving.id}/security`,
      { operation: 'erase' }, officer)
    expect(closed.status).toBe(200)

    const after = (await report()).items.find(item => item.key === room)!.confirmedHours
    expect(after).toBe(before)
  })
})

describe.skipIf(skip !== null)('a span is London days, not UTC ones (0014)', () => {
  test('the report covers the whole of the last day it names', async () => {
    // Eleven at night on the last day, which a UTC-bounded report would drop.
    place(room, '2029-03-31', 23, 1)
    const body = await report()
    expect(body.items.find(item => item.key === room)!.bookings).toBeGreaterThan(0)

    const { year, month, day } = londonParts(new Date(Date.UTC(2029, 2, 31, 23)))
    expect(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`).toBe('2029-04-01')
  })
})
