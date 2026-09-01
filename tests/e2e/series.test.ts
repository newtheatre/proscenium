import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { londonClock, londonParts } from '#shared/utils/london'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-110 and C-111. A term of rehearsals is one action, and one week is never the whole term by
// accident. The old app had neither (RM-1, RM-4).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let member: TestMember
let other: TestMember
const memberPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  const admin = await adminSession(app)
  officer = admin.cookie
  member = await registerMember(app, 'series-member', memberPassword)
  other = await registerMember(app, 'series-rival', generatePassword())
  giveMembership(member.id)
  giveMembership(other.id)

  // This suite is about series mechanics, and both of these have their own tests. Left at their
  // defaults, every case past week twelve would queue and every fifth term would hit the cap.
  await send('PUT', '/api/admin/config/ROOM_ACTIVE_BOOKINGS_PER_MEMBER', { value: 500 }, officer)
  await send('PUT', '/api/admin/config/ROOM_BOOKING_HORIZON_WEEKS', { value: 200 }, officer)
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

// Weeks out, so every occurrence clears the notice window and the whole series confirms.
function mondayIn(weeks: number): string {
  const at = new Date()
  at.setUTCDate(at.getUTCDate() + weeks * 7)
  while (at.getUTCDay() !== 1) at.setUTCDate(at.getUTCDate() + 1)
  const { year, month, day } = londonParts(at)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface SeriesAnswer { id: string, status: string, occurrences: { occurrence: number, day: string }[] }

function bookSeries(roomId: string, over: Record<string, unknown> = {}, as = member.cookie): Promise<Response> {
  return send('POST', '/api/rooms/series', {
    roomId,
    title: 'Weekly rehearsal',
    purpose: 'REHEARSAL',
    frequency: 'WEEKLY',
    weekdays: [1],
    startsOn: mondayIn(1),
    from: '19:00',
    to: '21:00',
    occurrences: 4,
    ...over,
  }, as)
}

function occurrencesOf(seriesId: string): { id: string, starts_at: number, status: string, occurrence: number }[] {
  return all('SELECT id, starts_at, status, occurrence FROM room_bookings WHERE series_id = ? ORDER BY starts_at', seriesId)
}

describe.skipIf(skip !== null)('booking a term at once (C-110)', () => {
  test('a weekly series confirms as a whole', async () => {
    const room = await makeRoom()
    const answered = await bookSeries(room)
    expect(answered.status).toBe(200)

    const body = await answered.json() as SeriesAnswer
    expect(body.status).toBe('CONFIRMED')
    expect(body.occurrences).toHaveLength(4)

    const held = occurrencesOf(body.id)
    expect(held).toHaveLength(4)
    expect(held.every(one => one.status === 'CONFIRMED')).toBe(true)
    expect(held.map(one => one.occurrence)).toEqual([1, 2, 3, 4])
  })

  test('every occurrence is an ordinary booking (criterion 5)', async () => {
    const room = await makeRoom()
    const { id } = await (await bookSeries(room)).json() as SeriesAnswer
    const first = occurrencesOf(id)[0]!

    // It holds its slot against anybody else, like any other booking.
    const clash = await send('POST', '/api/rooms/bookings', {
      roomId: room,
      title: 'On top of it',
      purpose: 'REHEARSAL',
      startsAt: new Date(first.starts_at * 1000).toISOString(),
      endsAt: new Date((first.starts_at + 3600) * 1000).toISOString(),
    }, other.cookie)
    expect(clash.status).toBe(409)
  })

  test('the series shows on the member s own list, with where in it each one falls', async () => {
    const room = await makeRoom()
    const { id } = await (await bookSeries(room)).json() as SeriesAnswer

    const listing = await (await send('GET', '/api/rooms/bookings?when=upcoming', null, member.cookie)).json() as {
      items: { id: string, seriesId: string | null, occurrence: number | null, seriesLength: number | null }[]
    }
    const mine = listing.items.filter(item => item.seriesId === id)

    expect(mine).toHaveLength(4)
    expect(mine.every(item => item.seriesLength === 4)).toBe(true)
    expect(mine.map(item => item.occurrence).sort()).toEqual([1, 2, 3, 4])
  })

  test('a daily series is every day running', async () => {
    const room = await makeRoom()
    const answered = await bookSeries(room, { frequency: 'DAILY', weekdays: [], occurrences: 3 })
    const body = await answered.json() as SeriesAnswer

    const days = body.occurrences.map(one => one.day)
    expect(days).toHaveLength(3)
    expect(new Set(days).size).toBe(3)
  })

  test('past the configured cap is refused', async () => {
    const room = await makeRoom()
    const answered = await bookSeries(room, { occurrences: 40 })
    expect(answered.status).toBe(422)
    expect((await answered.json() as { statusMessage: string }).statusMessage).toContain('12')
  })
})

describe.skipIf(skip !== null)('nothing is written when one week fails (criterion 3)', () => {
  test('a taken week refuses the series and writes nothing at all', async () => {
    const room = await makeRoom()
    const startsOn = mondayIn(2)

    // Somebody holds the second Monday, so the series cannot have it.
    const firstAnswer = await bookSeries(room, { startsOn, occurrences: 1 }, other.cookie)
    expect(firstAnswer.status).toBe(200)
    const taken = (await firstAnswer.json() as SeriesAnswer).occurrences[0]!.day

    const before = read<{ n: number }>('SELECT count(*) n FROM room_bookings')!.n
    const answered = await bookSeries(room, { startsOn, occurrences: 3 })

    expect(answered.status).toBe(422)
    const body = await answered.json() as { data: { refusals: { day: string, conflicts: unknown[] }[], total: number } }
    expect(body.data.refusals).toHaveLength(1)
    expect(body.data.refusals[0]!.day).toBe(taken)
    expect(body.data.refusals[0]!.conflicts.length).toBeGreaterThan(0)

    // Not one row of the refused series exists, including the weeks that were free.
    expect(read<{ n: number }>('SELECT count(*) n FROM room_bookings')!.n).toBe(before)
    expect(read<{ n: number }>('SELECT count(*) n FROM room_series WHERE user_id = ? AND starts_on = ?', member.id, startsOn)!.n).toBe(0)
  })

  test('resubmitting without the bad week books the rest, on the days they were on', async () => {
    const room = await makeRoom()
    const startsOn = mondayIn(3)
    const taken = (await (await bookSeries(room, { startsOn, occurrences: 1 }, other.cookie)).json() as SeriesAnswer)
      .occurrences[0]!.day

    const refused = await bookSeries(room, { startsOn, occurrences: 3 })
    const refusals = (await refused.json() as { data: { refusals: { day: string }[] } }).data.refusals

    const answered = await bookSeries(room, { startsOn, occurrences: 3, skip: refusals.map(one => one.day) })
    expect(answered.status).toBe(200)

    const body = await answered.json() as SeriesAnswer
    expect(body.occurrences).toHaveLength(2)
    expect(body.occurrences.map(one => one.day)).not.toContain(taken)
  })

  test('every failing week is listed, not just the first', async () => {
    const room = await makeRoom()
    const startsOn = mondayIn(4)
    await bookSeries(room, { startsOn, occurrences: 3 }, other.cookie)

    const answered = await bookSeries(room, { startsOn, occurrences: 3 })
    const body = await answered.json() as { data: { refusals: unknown[], total: number } }

    expect(body.data.refusals).toHaveLength(3)
    expect(body.data.total).toBe(3)
  })

  test('skipping everything is not a series', async () => {
    const room = await makeRoom()
    const startsOn = mondayIn(5)
    const days = (await (await bookSeries(room, { startsOn, occurrences: 2 })).json() as SeriesAnswer)
      .occurrences.map(one => one.day)

    const answered = await bookSeries(room, { startsOn, occurrences: 2, skip: days })
    expect(answered.status).toBe(422)
  })
})

describe.skipIf(skip !== null)('a series out of policy queues as a whole (criterion 6)', () => {
  test('a sensitive room queues every occurrence, not some of them', async () => {
    const room = await makeRoom({ sensitive: true })
    const answered = await bookSeries(room, { startsOn: mondayIn(6) })

    const body = await answered.json() as SeriesAnswer
    expect(body.status).toBe('PENDING_APPROVAL')

    const held = occurrencesOf(body.id)
    expect(held).toHaveLength(4)
    expect(held.every(one => one.status === 'PENDING_APPROVAL')).toBe(true)
  })

  test('one week inside the notice window queues the whole run', async () => {
    const room = await makeRoom()
    const soon = new Date()
    soon.setUTCDate(soon.getUTCDate() + 1)
    const { year, month, day } = londonParts(soon)
    const startsOn = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    const answered = await bookSeries(room, { frequency: 'DAILY', weekdays: [], startsOn, occurrences: 3 })
    const body = await answered.json() as SeriesAnswer

    expect(body.status).toBe('PENDING_APPROVAL')
    expect(occurrencesOf(body.id).every(one => one.status === 'PENDING_APPROVAL')).toBe(true)
  })
})

describe.skipIf(skip !== null)('a series counts each occurrence against the cap', () => {
  test('a term longer than the cap queues rather than confirming', async () => {
    const room = await makeRoom()
    await send('PUT', '/api/admin/config/ROOM_ACTIVE_BOOKINGS_PER_MEMBER', { value: 3 }, officer)
    try {
      const answered = await bookSeries(room, { startsOn: mondayIn(20), occurrences: 4 })
      const body = await answered.json() as SeriesAnswer

      expect(body.status).toBe('PENDING_APPROVAL')
      const held = occurrencesOf(body.id)
      // The fourth is the one over the cap, and it takes the whole run with it (criterion 6).
      expect(held).toHaveLength(4)
      expect(held.every(one => one.status === 'PENDING_APPROVAL')).toBe(true)
    }
    finally {
      await send('PUT', '/api/admin/config/ROOM_ACTIVE_BOOKINGS_PER_MEMBER', { value: 500 }, officer)
    }
  })
})

describe.skipIf(skip !== null)('the wall clock holds across a transition (criterion 4)', () => {
  test('every occurrence starts at the hour that was asked for', async () => {
    const room = await makeRoom()
    const { id } = await (await bookSeries(room, { startsOn: mondayIn(7), from: '19:00', to: '21:00' })).json() as SeriesAnswer

    for (const one of occurrencesOf(id)) {
      expect(londonClock(new Date(one.starts_at * 1000))).toBe('19:00')
    }
  })
})

describe.skipIf(skip !== null)('cancelling asks which (C-111 criterion 1)', () => {
  async function aSeries(weeks: number): Promise<{ id: string, who: TestMember, occurrences: ReturnType<typeof occurrencesOf> }> {
    const room = await makeRoom()
    const { id } = await (await bookSeries(room, { startsOn: mondayIn(weeks) }, member.cookie)).json() as SeriesAnswer
    return { id, who: member, occurrences: occurrencesOf(id) }
  }

  test('cancelling an occurrence without saying which is refused', async () => {
    const { who, occurrences } = await aSeries(8)
    const answered = await send('POST', `/api/rooms/bookings/${occurrences[1]!.id}/cancel`, {}, who.cookie)

    expect(answered.status).toBe(422)
    expect((await answered.json() as { data: { needsScope: boolean } }).data.needsScope).toBe(true)
    // Nothing was cancelled by asking.
    expect(occurrencesOf(occurrences[1]!.id.slice(0, 0) || '')).toHaveLength(0)
    expect(read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', occurrences[1]!.id)?.status)
      .toBe('CONFIRMED')
  })

  test('a booking that is not in a series needs no scope', async () => {
    const room = await makeRoom()
    const who = member
    const at = new Date()
    at.setUTCDate(at.getUTCDate() + 21)
    at.setUTCHours(12, 0, 0, 0)

    const booked = await send('POST', '/api/rooms/bookings', {
      roomId: room,
      title: 'On its own',
      purpose: 'REHEARSAL',
      startsAt: at.toISOString(),
      endsAt: new Date(at.getTime() + 3_600_000).toISOString(),
    }, who.cookie)
    expect(booked.status).toBe(200)
    const { id } = await booked.json() as { id: string }

    expect((await send('POST', `/api/rooms/bookings/${id}/cancel`, {}, who.cookie)).status).toBe(200)
  })

  test('this occurrence cancels one week and leaves the rest', async () => {
    const { who, occurrences } = await aSeries(9)
    const answered = await send('POST', `/api/rooms/bookings/${occurrences[1]!.id}/cancel`,
      { scope: 'occurrence' }, who.cookie)

    expect(answered.status).toBe(200)
    expect((await answered.json() as { cancelled: number }).cancelled).toBe(1)

    const after = occurrencesOf(occurrences[0]!.id.slice(0, 0) || '')
    expect(after).toHaveLength(0)
    const statuses = all<{ status: string }>(
      'SELECT status FROM room_bookings WHERE series_id = (SELECT series_id FROM room_bookings WHERE id = ?) ORDER BY starts_at',
      occurrences[1]!.id).map(row => row.status)
    expect(statuses).toEqual(['CONFIRMED', 'CANCELLED', 'CONFIRMED', 'CONFIRMED'])
  })

  test('the whole series cancels every occurrence still standing (criterion 2)', async () => {
    const { id, who, occurrences } = await aSeries(10)
    await send('POST', `/api/rooms/bookings/${occurrences[2]!.id}/cancel`, { scope: 'occurrence' }, who.cookie)

    const answered = await send('POST', `/api/rooms/bookings/${occurrences[0]!.id}/cancel`,
      { scope: 'series' }, who.cookie)
    expect(answered.status).toBe(200)
    // The one already cancelled is untouched, so three went, not four.
    expect((await answered.json() as { cancelled: number }).cancelled).toBe(3)
    expect(occurrencesOf(id).every(one => one.status === 'CANCELLED')).toBe(true)
  })

  test('a series cancel frees every slot for somebody else', async () => {
    const room = await makeRoom()
    const startsOn = mondayIn(11)
    const who = member
    const next = other
    const { id } = await (await bookSeries(room, { startsOn }, who.cookie)).json() as SeriesAnswer
    const held = occurrencesOf(id)

    await send('POST', `/api/rooms/bookings/${held[0]!.id}/cancel`, { scope: 'series' }, who.cookie)

    const answered = await bookSeries(room, { startsOn }, next.cookie)
    expect(answered.status).toBe(200)
  })

  test('cancelling somebody else s series is refused', async () => {
    const { id, occurrences } = await aSeries(12)
    const answered = await send('POST', `/api/rooms/bookings/${occurrences[0]!.id}/cancel`,
      { scope: 'series' }, other.cookie)

    expect(answered.status).toBe(404)
    expect(occurrencesOf(id).every(one => one.status === 'CONFIRMED')).toBe(true)
  })
})

describe.skipIf(skip !== null)('the head follows what is left (C-111 criterion 3)', () => {
  test('cancelling the head promotes the next occurrence', async () => {
    const room = await makeRoom()
    const who = member
    const { id } = await (await bookSeries(room, { startsOn: mondayIn(13) }, who.cookie)).json() as SeriesAnswer
    const held = occurrencesOf(id)

    expect(read<{ head: string }>('SELECT head_booking_id AS head FROM room_series WHERE id = ?', id)?.head)
      .toBe(held[0]!.id)

    await send('POST', `/api/rooms/bookings/${held[0]!.id}/cancel`, { scope: 'occurrence' }, who.cookie)

    expect(read<{ head: string }>('SELECT head_booking_id AS head FROM room_series WHERE id = ?', id)?.head)
      .toBe(held[1]!.id)
  })

  test('cancelling one in the middle leaves the head where it was', async () => {
    const room = await makeRoom()
    const who = member
    const { id } = await (await bookSeries(room, { startsOn: mondayIn(14) }, who.cookie)).json() as SeriesAnswer
    const held = occurrencesOf(id)

    await send('POST', `/api/rooms/bookings/${held[2]!.id}/cancel`, { scope: 'occurrence' }, who.cookie)

    expect(read<{ head: string }>('SELECT head_booking_id AS head FROM room_series WHERE id = ?', id)?.head)
      .toBe(held[0]!.id)
  })

  test('cancelling the whole run leaves it headless, not pointing at a dead week', async () => {
    const room = await makeRoom()
    const who = member
    const { id } = await (await bookSeries(room, { startsOn: mondayIn(15) }, who.cookie)).json() as SeriesAnswer
    const held = occurrencesOf(id)

    await send('POST', `/api/rooms/bookings/${held[0]!.id}/cancel`, { scope: 'series' }, who.cookie)

    expect(read<{ head: string | null }>('SELECT head_booking_id AS head FROM room_series WHERE id = ?', id)?.head)
      .toBeNull()
  })
})

describe.skipIf(skip !== null)('one message for a series, not one per week (C-111 criterion 5)', () => {
  function sentTo(userId: string, type: string): number {
    return read<{ n: number }>(
      'SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = ?', userId, type)?.n ?? 0
  }

  test('booking a term sends one', async () => {
    const who = member
    const before = sentTo(who.id, 'room.series.confirmed')
    const room = await makeRoom()
    expect((await bookSeries(room, { startsOn: mondayIn(16) }, who.cookie)).status).toBe(200)

    expect(sentTo(who.id, 'room.series.confirmed') - before).toBe(1)
  })

  test('cancelling a term sends one, naming the weeks', async () => {
    const room = await makeRoom()
    const who = member
    const { id } = await (await bookSeries(room, { startsOn: mondayIn(17) }, who.cookie)).json() as SeriesAnswer
    const held = occurrencesOf(id)

    const before = sentTo(who.id, 'room.series.cancelled')
    await send('POST', `/api/rooms/bookings/${held[0]!.id}/cancel`, { scope: 'series' }, who.cookie)
    expect(sentTo(who.id, 'room.series.cancelled') - before).toBe(1)

    const files = [...new Bun.Glob('*.txt').scanSync({ cwd: '.data/mail', onlyFiles: true })]
    const bodies = await Promise.all(files.map(name => Bun.file(`.data/mail/${name}`).text()))
    const message = bodies.find(body => body.includes('Cancelled: 4 bookings') && body.includes(who.email))
    expect(message).toBeDefined()
  })

  test('cancelling one week sends the ordinary single message', async () => {
    const room = await makeRoom()
    const who = member
    const { id } = await (await bookSeries(room, { startsOn: mondayIn(18) }, who.cookie)).json() as SeriesAnswer
    const held = occurrencesOf(id)

    const before = sentTo(who.id, 'room.booking.cancelled')
    await send('POST', `/api/rooms/bookings/${held[1]!.id}/cancel`, { scope: 'occurrence' }, who.cookie)
    expect(sentTo(who.id, 'room.booking.cancelled') - before).toBe(1)
  })
})

describe.skipIf(skip !== null)('two members racing for the same term (0035)', () => {
  // An in-process SQLite serialises writes, so this proves no partial series is left behind
  // rather than that the batch is atomic under D1 (0022).
  test('only one series is written, and the loser leaves nothing', async () => {
    const room = await makeRoom()
    const startsOn = mondayIn(19)
    const one = member
    const two = other

    const [mine, theirs] = await Promise.all([
      bookSeries(room, { startsOn }, one.cookie),
      bookSeries(room, { startsOn }, two.cookie),
    ])

    const won = [mine, theirs].filter(answer => answer.status === 200)
    expect(won).toHaveLength(1)

    // Whoever lost wrote nothing: four occurrences exist in that span, not five or eight.
    const rows = all<{ n: number }>(
      `SELECT count(*) n FROM room_bookings WHERE room_id = ? AND status = 'CONFIRMED'`, room)
    expect(rows[0]!.n).toBe(4)
    expect(read<{ n: number }>('SELECT count(*) n FROM room_series WHERE room_id = ?', room)!.n).toBe(1)
  })
})

describe.skipIf(skip !== null)('the screens (C-110, C-111)', () => {
  async function signIn(view: Bun.WebView): Promise<void> {
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', member.email)
    await fill(view, 'form input[type="password"]', memberPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="sign-out"]')`)
  }

  test('a member books a term from the form, and the list says where each week falls', async () => {
    const room = await makeRoom()
    const startsOn = mondayIn(21)

    const view = await openSignedOutView(app.baseURL)
    try {
      await signIn(view)
      await visit(view, `${app.baseURL}/rooms/book?room=${room}&day=${startsOn}&at=19:00&purpose=REHEARSAL`, '[data-test="booking-form"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await fill(view, '[data-test="booking-title"]', 'Weekly rehearsal')
      await click(view, '[data-test="repeat-toggle"]')
      await waitFor(view, `document.querySelector('[data-test="repeat-count"]')`, 30_000)

      // The form says what it is about to do before it does it.
      await waitFor(view, `document.querySelector('[data-test="repeat-summary"]')`, 30_000)
      expect(await textOf(view, '[data-test="repeat-summary"]')).toContain('19:00')

      await waitFor(view, `document.querySelector('[data-test="series-submit"]')`, 30_000)
      await click(view, '[data-test="series-submit"]')

      await waitFor(view, `document.querySelector('[data-test="mine-list"]')`, 30_000)
      const held = all<{ id: string }>(
        `SELECT id FROM room_bookings WHERE room_id = ? AND status = 'CONFIRMED'`, room)
      expect(held).toHaveLength(4)

      // Each occurrence says where in the term it sits.
      expect(await textOf(view, 'body')).toContain('of 4 in a series')
    }
    finally {
      view.close()
    }
  }, 180_000)

  test('cancelling a week asks which, and will not act until told', async () => {
    const room = await makeRoom()
    const { id } = await (await bookSeries(room, { startsOn: mondayIn(22), occurrences: 3 })).json() as SeriesAnswer
    const held = occurrencesOf(id)

    const view = await openSignedOutView(app.baseURL)
    try {
      await signIn(view)
      await visit(view, `${app.baseURL}/rooms/mine`, '[data-test="mine-list"]')

      await click(view, `[data-test="cancel-${held[1]!.id}"]`)
      await waitFor(view, `document.querySelector('[data-test="cancel-scope"]')`, 30_000)

      // Nothing is preselected, so the button cannot be pressed yet (criterion 1).
      const blocked = await view.evaluate<boolean>(
        `document.querySelector('[data-test="cancel-confirm"]').disabled`)
      expect(blocked).toBe(true)

      // Chosen by what it says rather than by a value attribute, which is the radio group's own.
      await view.evaluate(`[...document.querySelectorAll('[data-test="cancel-scope"] *')]
        .filter(node => node.textContent.trim().startsWith('Just this one'))
        .pop().click()`)
      await waitFor(view, `!document.querySelector('[data-test="cancel-confirm"]').disabled`, 30_000)
      await click(view, '[data-test="cancel-confirm"]')
      await waitFor(view, `!document.querySelector('[data-test="cancel-${held[1]!.id}"]')`, 30_000)

      const statuses = occurrencesOf(id).map(one => one.status)
      expect(statuses).toEqual(['CONFIRMED', 'CANCELLED', 'CONFIRMED'])
    }
    finally {
      view.close()
    }
  }, 180_000)
})
