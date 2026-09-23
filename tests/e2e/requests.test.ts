import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-108. A booking outside policy is a request somebody decides on. The old app let one sit
// forever, which is what the escalation and the expiry exist to stop (audit RM-6).

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
  member = await registerMember(app, 'asker', generatePassword())
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

// Inside the notice window, so the policy will not confirm it and a request is the only way.
function soon(daysAhead: number, hour = 10, hours = 2): { startsAt: string, endsAt: string } {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + daysAhead)
  start.setUTCHours(hour, 0, 0, 0)
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString() }
}

const ask = (roomId: string, span: { startsAt: string, endsAt: string }, reason: string, as = member.cookie): Promise<Response> =>
  send('POST', '/api/rooms/requests', { roomId, title: 'Dress run', purpose: 'REHEARSAL', ...span, reason }, as)

describe.skipIf(skip !== null)('asking for a slot outside policy (C-108)', () => {
  test('a short-notice span is refused as a booking and accepted as a request', async () => {
    const room = await makeRoom()
    const span = soon(1, 9)

    const refused = await send('POST', '/api/rooms/bookings', { roomId: room, title: 'Dress run', purpose: 'REHEARSAL', ...span }, member.cookie)
    expect(refused.status).toBe(422)
    expect((await refused.json() as { data: { canRequest: boolean } }).data.canRequest).toBe(true)

    const asked = await ask(room, span, 'The get-in is that afternoon.')
    expect(asked.status).toBe(200)
    expect((await asked.json() as { status: string }).status).toBe('PENDING_APPROVAL')
  })

  test('a request needs a reason', async () => {
    const room = await makeRoom()
    expect((await ask(room, soon(1, 11), '')).status).toBe(400)
    expect((await ask(room, soon(1, 11), '   ')).status).toBe(400)
  })

  // Criterion 2: the slot is held, or an instant booking takes it from under the decision.
  test('a pending request holds its slot against an instant booking', async () => {
    const room = await makeRoom()
    const span = soon(1, 13)
    expect((await ask(room, span, 'Needed for the get-in.')).status).toBe(200)

    const other = await registerMember(app, 'other-asker', generatePassword())
    giveMembership(other.id)
    const beaten = await send('POST', '/api/rooms/bookings', { roomId: room, title: 'Mine', purpose: 'REHEARSAL', ...span }, other.cookie)
    expect([409, 422]).toContain(beaten.status)
  })

  test('the reason is the member\'s own words and stays out of the trail', async () => {
    const room = await makeRoom()
    const reason = 'My grandmother is visiting and wants to watch a rehearsal.'
    const asked = await ask(room, soon(1, 15), reason)
    const { id } = await asked.json() as { id: string }

    expect(read<{ reason: string }>('SELECT reason FROM room_bookings WHERE id = ?', id)?.reason).toBe(reason)
    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE target = ? AND action = 'room.requested'`, `booking:${id}`)
    expect(entry?.detail).not.toContain('grandmother')
    // The rules it broke are recorded, because those are facts about the policy.
    expect(entry?.detail).toContain('SHORT_NOTICE')
  })

  test('a sensitive room takes the same path even when nothing failed', async () => {
    const room = await makeRoom({ sensitive: true })
    const asked = await ask(room, soon(9, 10), 'It is the only room with the right rig.')
    expect(asked.status).toBe(200)
  })

  test('a lapsed membership cannot be asked around', async () => {
    const stranger = await registerMember(app, 'no-card', generatePassword())
    const room = await makeRoom()
    expect((await ask(room, soon(1, 17), 'Please', stranger.cookie)).status).toBe(422)
  })

  test('the request shows in the member\'s own list, waiting', async () => {
    const room = await makeRoom()
    const { id } = await (await ask(room, soon(2, 9), 'The get-in is that afternoon.')).json() as { id: string }

    const mine = await (await send('GET', '/api/rooms/bookings', undefined, member.cookie)).json() as {
      items: { id: string, status: string, cancellable: boolean }[]
    }
    const held = mine.items.find(one => one.id === id)
    expect(held?.status).toBe('PENDING_APPROVAL')
    // Criterion 4's withdrawal half: a member may take back what nobody has answered.
    expect(held?.cancellable).toBe(true)
  })
})

describe.skipIf(skip !== null)('a request nobody answers (C-108 criterion 3)', () => {
  test('one that has waited is escalated once, and not again', async () => {
    const room = await makeRoom()
    const { id } = await (await ask(room, soon(20, 10), 'Waiting.')).json() as { id: string }
    write(`UPDATE room_bookings SET created_at = ? WHERE id = ?`, Math.floor(Date.now() / 1000) - 60 * 3600, id)

    const first = await (await send('POST', '/api/dev/sweep-requests', {}, officer)).json() as { escalated: number }
    expect(first.escalated).toBe(1)
    expect(read<{ at: number }>('SELECT escalated_at AS at FROM room_bookings WHERE id = ?', id)?.at).toBeGreaterThan(0)

    const again = await (await send('POST', '/api/dev/sweep-requests', {}, officer)).json() as { escalated: number }
    expect(again.escalated).toBe(0)
  })

  test('one that has waited too long lapses, and the member is told', async () => {
    const room = await makeRoom()
    const { id } = await (await ask(room, soon(21, 10), 'Waiting a long time.')).json() as { id: string }
    write(`UPDATE room_bookings SET created_at = ? WHERE id = ?`, Math.floor(Date.now() / 1000) - 300 * 3600, id)

    const swept = await (await send('POST', '/api/dev/sweep-requests', {}, officer)).json() as { expired: number }
    expect(swept.expired).toBe(1)

    const row = read<{ status: string, reason: string }>(
      'SELECT status, rejection_reason AS reason FROM room_bookings WHERE id = ?', id)
    expect(row?.status).toBe('REJECTED')
    expect(row?.reason).toContain('lapsed')

    const told = read<{ n: number }>(`
      SELECT count(*) n FROM notification_log l JOIN users u ON u.id = l.user_id
      WHERE u.email = ? AND l.type = 'room.request.expired'`, member.email)
    expect(told?.n).toBeGreaterThan(0)
  })

  test('a lapsed request frees its slot', async () => {
    const room = await makeRoom()
    const span = soon(22, 10)
    const { id } = await (await ask(room, span, 'Waiting.')).json() as { id: string }
    write(`UPDATE room_bookings SET created_at = ? WHERE id = ?`, Math.floor(Date.now() / 1000) - 300 * 3600, id)
    await send('POST', '/api/dev/sweep-requests', {}, officer)

    const day = span.startsAt.slice(0, 10)
    const found = await (await send('GET', `/api/rooms/availability?from=${day}&to=${day}&roomId=${room}`, undefined, member.cookie)).json() as { rooms: { taken: unknown[] }[] }
    expect(found.rooms[0]?.taken).toEqual([])
  })
})

// Criterion 4 (issue 1055): the owner changes a request while it waits, and every check re-runs.
describe.skipIf(skip !== null)('editing a request while it waits (C-108 criterion 4)', () => {
  const change = (id: string, roomId: string, span: { startsAt: string, endsAt: string }, over: Record<string, unknown> = {}, as = member.cookie): Promise<Response> =>
    send('PUT', `/api/rooms/bookings/${id}`, { roomId, title: 'Dress run', purpose: 'REHEARSAL', ...span, reason: 'Still needed.', ...over }, as)

  const startOf = (id: string): number | undefined =>
    read<{ startsAt: number }>('SELECT starts_at AS startsAt FROM room_bookings WHERE id = ?', id)?.startsAt

  test('the owner changes the numbers and the request stays waiting', async () => {
    const room = await makeRoom()
    const span = soon(3, 9)
    const { id } = await (await ask(room, span, 'The get-in is that afternoon.')).json() as { id: string }

    const changed = await change(id, room, span, { attendees: 12 })
    expect(changed.status).toBe(200)
    expect(read<{ attendees: number, status: string }>('SELECT attendees, status FROM room_bookings WHERE id = ?', id))
      .toEqual({ attendees: 12, status: 'PENDING_APPROVAL' })
  })

  test('a confirmed booking is refused', async () => {
    const room = await makeRoom()
    const span = soon(3, 11)
    const { id } = await (await ask(room, span, 'Please.')).json() as { id: string }
    await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)

    const refused = await change(id, room, span, { attendees: 3 })
    expect(refused.status).toBe(409)
    expect((await refused.json() as { statusMessage: string }).statusMessage).toBe('That booking is already confirmed, so it cannot be changed')
  })

  test('somebody else\'s request reads as not theirs', async () => {
    const room = await makeRoom()
    const span = soon(3, 13)
    const { id } = await (await ask(room, span, 'Please.')).json() as { id: string }
    const other = await registerMember(app, 'nosy', generatePassword())
    giveMembership(other.id)
    expect((await change(id, room, span, {}, other.cookie)).status).toBe(404)
  })

  // The policy re-runs in full: a span nothing could make right is refused, not queued.
  test('the policy re-runs, so a move into the past is refused outright', async () => {
    const room = await makeRoom()
    const span = soon(3, 15)
    const { id } = await (await ask(room, span, 'Please.')).json() as { id: string }
    const refused = await change(id, room, soon(-2, 10))
    expect(refused.status).toBe(422)
    expect((await refused.json() as { data: { canRequest: boolean } }).data.canRequest).toBe(false)
    expect(startOf(id)).toBe(Math.floor(new Date(span.startsAt).getTime() / 1000))
  })

  test('a span somebody else holds is refused and the request keeps its slot', async () => {
    const room = await makeRoom()
    const mine = soon(4, 9)
    const theirs = soon(4, 14)
    const { id } = await (await ask(room, mine, 'Please.')).json() as { id: string }
    const other = await registerMember(app, 'holder', generatePassword())
    giveMembership(other.id)
    expect((await ask(room, theirs, 'Mine first.', other.cookie)).status).toBe(200)

    expect((await change(id, room, theirs)).status).toBe(409)
    expect(startOf(id)).toBe(Math.floor(new Date(mine.startsAt).getTime() / 1000))
  })

  test('moving the day restarts the escalation clock; changing the title does not', async () => {
    const room = await makeRoom()
    const span = soon(5, 10)
    const { id } = await (await ask(room, span, 'Please.')).json() as { id: string }
    const long = Math.floor(Date.now() / 1000) - 60 * 3600
    write('UPDATE room_bookings SET created_at = ?, escalated_at = ? WHERE id = ?', long, long + 3600, id)

    expect((await change(id, room, span, { title: 'Tech run' })).status).toBe(200)
    expect(read<{ createdAt: number }>('SELECT created_at AS createdAt FROM room_bookings WHERE id = ?', id)?.createdAt).toBe(long)

    expect((await change(id, room, soon(6, 10))).status).toBe(200)
    const restarted = read<{ createdAt: number, escalatedAt: number | null }>(
      'SELECT created_at AS createdAt, escalated_at AS escalatedAt FROM room_bookings WHERE id = ?', id)
    expect(restarted?.createdAt).toBeGreaterThan(long)
    expect(restarted?.escalatedAt).toBeNull()
  })

  test('the trail records what moved, and never the member\'s own words', async () => {
    const room = await makeRoom()
    const span = soon(7, 10)
    const { id } = await (await ask(room, span, 'Please.')).json() as { id: string }
    await change(id, room, span, { attendees: 5, reason: 'My grandmother is visiting.' })

    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE target = ? AND action = 'room.request.edited'`, `booking:${id}`)
    expect(entry?.detail).toContain('attendees')
    expect(entry?.detail).toContain('reason')
    expect(entry?.detail).not.toContain('grandmother')
  })

  // C-111 criterion 1: asked, and the whole series is refused until series editing is built.
  test('a week of a series asks which, and the whole series is refused', async () => {
    const room = await makeRoom()
    const day = soon(1, 10).startsAt.slice(0, 10)
    const series = await send('POST', '/api/rooms/series', {
      roomId: room,
      title: 'Term rehearsals',
      purpose: 'REHEARSAL',
      frequency: 'DAILY',
      startsOn: day,
      from: '19:00',
      to: '21:00',
      occurrences: 2,
    }, member.cookie)
    const { id: seriesId } = await series.json() as { id: string }
    const week = read<{ id: string, startsAt: number, endsAt: number }>(
      `SELECT id, starts_at AS startsAt, ends_at AS endsAt FROM room_bookings WHERE series_id = ? ORDER BY occurrence LIMIT 1`, seriesId)!
    const span = { startsAt: new Date(week.startsAt * 1000).toISOString(), endsAt: new Date(week.endsAt * 1000).toISOString() }

    expect((await change(week.id, room, span)).status).toBe(422)
    const whole = await change(week.id, room, span, { scope: 'series' })
    expect(whole.status).toBe(422)
    expect((await whole.json() as { statusMessage: string }).statusMessage).toContain('whole series')
    expect((await change(week.id, room, span, { scope: 'occurrence', attendees: 4 })).status).toBe(200)
  })
})
