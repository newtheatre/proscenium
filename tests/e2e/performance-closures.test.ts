import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { daysAfter } from '#shared/utils/membership'
import { fromLondonWallClock } from '#shared/utils/london'
import { showNightOf } from '#shared/utils/show-night'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1347 (C-114 as amended, D-131 criterion 1, 0043): a venue's room is closed over each of
// its performances' shift windows, without anybody typing the show week in as a closure.

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
  member = await registerMember(app, 'show-week', generatePassword())
  write(
    `INSERT INTO memberships (id, user_id, starts_on, expires_on, source)
     VALUES (?, ?, date('now', '-30 days'), date('now', '+300 days'), 'MANUAL')`,
    crypto.randomUUID().replaceAll('-', ''), member.id,
  )
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

// A 19:30 curtain on a night three weeks out, well clear of every notice window, with doors at
// 19:00 and two hours' running time, at a venue attached to `roomId`.
function performanceIn(roomId: string | null, suffix: string, status: 'ON_SALE' | 'CANCELLED' | 'DRAFT' = 'ON_SALE'): string {
  const database = new Database(app.databaseFile)
  try {
    const night = daysAfter(showNightOf(new Date()), 21)
    tonightsPerformance(sqliteTarget(database), { night, suffix, roomId, status, curtainHoursAfterNightStart: 15.5 })
    return night
  }
  finally {
    database.close()
  }
}

function at(night: string, hour: number, minute = 0): string {
  const [year, month, day] = night.split('-').map(Number)
  return fromLondonWallClock(year!, month!, day!, hour, minute).toISOString()
}

const book = (roomId: string, startsAt: string, endsAt: string): Promise<Response> =>
  send('POST', '/api/rooms/bookings', { roomId, title: 'Rehearsal', purpose: 'REHEARSAL', startsAt, endsAt }, member.cookie)

interface Refusal { data: { failures: { reason: string, says: string }[] } }

describe.skipIf(skip !== null)('a performance closes its venue\'s room over its shift window', () => {
  test('a booking over the evening is refused, naming the show', async () => {
    const room = await makeRoom()
    const night = performanceIn(room, 'refused')

    const answered = await book(room, at(night, 18), at(night, 20))
    expect(answered.status).toBe(422)
    const body = await answered.json() as Refusal
    expect(body.data.failures).toEqual([{ reason: 'ROOM_CLOSED', says: 'The room is closed then: A Test Show is on' }])
  })

  test('a request cannot get round it either', async () => {
    const room = await makeRoom()
    const night = performanceIn(room, 'requested')

    const answered = await send('POST', '/api/rooms/requests', {
      roomId: room, title: 'Rehearsal', purpose: 'REHEARSAL', reason: 'Only night we can', startsAt: at(night, 21), endsAt: at(night, 22),
    }, member.cookie)
    expect(answered.status).toBe(422)
    expect((await answered.json() as Refusal).data.failures[0]?.reason).toBe('ROOM_CLOSED')
  })

  test('the afternoon before the window is bookable', async () => {
    const room = await makeRoom()
    const night = performanceIn(room, 'afternoon')
    expect((await book(room, at(night, 14), at(night, 16))).status).toBe(200)
  })

  test('a cancelled performance closes nothing', async () => {
    const room = await makeRoom()
    const night = performanceIn(room, 'called-off', 'CANCELLED')
    expect((await book(room, at(night, 18), at(night, 20))).status).toBe(200)
  })

  test('a venue with no room closes no room', async () => {
    const room = await makeRoom()
    const night = performanceIn(null, 'roomless')
    expect((await book(room, at(night, 18), at(night, 20))).status).toBe(200)
  })

  test('availability shows the closure to a member, with the show named', async () => {
    const room = await makeRoom()
    const night = performanceIn(room, 'calendar')

    const answered = await send('GET', `/api/rooms/availability?from=${night}&to=${night}&roomId=${room}`, null, member.cookie)
    const body = await answered.json() as { rooms: { closed: { reason: string, startsAt: number, endsAt: number }[] }[] }
    expect(body.rooms[0]!.closed).toEqual([{
      reason: 'A Test Show is on',
      startsAt: Math.floor(new Date(at(night, 18, 30)).getTime() / 1000),
      endsAt: Math.floor(new Date(at(night, 22)).getTime() / 1000),
    }])
  })
})

describe.skipIf(skip !== null)('the Theatre Manager sees each performance closure, and what it overlaps', () => {
  interface Listed { items: { performanceId: string, roomId: string, reason: string, overlapping: { title: string }[] }[] }

  test('listed read-only, with a booking made before the performance was scheduled, which is left standing', async () => {
    const room = await makeRoom()
    const night = daysAfter(showNightOf(new Date()), 22)
    const booked = await book(room, at(night, 18), at(night, 20))
    expect(booked.status).toBe(200)
    const { id } = await booked.json() as { id: string }

    const database = new Database(app.databaseFile)
    try {
      tonightsPerformance(sqliteTarget(database), { night, suffix: 'overlapping', roomId: room, curtainHoursAfterNightStart: 15.5 })
    }
    finally {
      database.close()
    }

    const answered = await send('GET', '/api/admin/rooms/blackouts/performances', null, officer)
    expect(answered.status).toBe(200)
    const listed = (await answered.json() as Listed).items.find(item => item.performanceId === 'performance-overlapping')
    expect(listed).toMatchObject({ roomId: room, reason: 'A Test Show is on' })
    expect(listed?.overlapping.map(one => one.title)).toEqual(['Rehearsal'])

    const statusOf = new Database(app.databaseFile, { readonly: true })
    try {
      expect((statusOf.query('SELECT status FROM room_bookings WHERE id = ?').get(id) as { status: string }).status).toBe('CONFIRMED')
    }
    finally {
      statusOf.close()
    }
  })

  test('a member cannot read the list', async () => {
    expect((await send('GET', '/api/admin/rooms/blackouts/performances', null, member.cookie)).status).toBe(403)
  })
})
