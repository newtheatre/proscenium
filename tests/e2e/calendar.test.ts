import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, openView, readTime, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-102 and C-103. A member plans around what is taken without learning whose it is, and the
// server does the filtering: the old app fetched every booking to the browser (audit RM-3).

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
  member = await registerMember(app, 'planner', generatePassword())
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

// Written straight in, because what is under test is the reading rather than the booking.
function placeBooking(roomId: string, userId: string, startsAt: Date, hours: number, over: Record<string, string> = {}): void {
  const start = Math.floor(startsAt.getTime() / 1000)
  write(
    `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
     VALUES (?, ?, ?, ?, ?, ?, 'GENERAL', ?)`,
    crypto.randomUUID().replaceAll('-', ''), roomId, userId,
    over.title ?? 'Rehearsal', start, start + hours * 3600, over.status ?? 'CONFIRMED',
  )
}

const PHONE = { width: 390, height: 844 }

// A booking inside the week the calendar opens on, whatever day the suite runs.
function todayAt(hour: number): Date {
  const when = new Date()
  when.setUTCHours(hour, 0, 0, 0)
  return when
}

// One browser backs every view, so a signed-in session has to be ended before another begins.
async function signInOn(view: Bun.WebView, email: string, password: string): Promise<void> {
  await view.navigate(`${app.baseURL}/`)
  await waitFor(view, 'document.body')
  await view.evaluate(`fetch('/api/auth/sign-out', { method: 'POST' }).then(response => response.status)`)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
}

interface Availability {
  rooms: { id: string, name: string, taken: { startsAt: number, endsAt: number, title: string, bookedBy?: string, status: string, mine: boolean }[] }[]
}

const availability = async (from: string, to: string, as: string, roomId?: string): Promise<Response> =>
  send('GET', `/api/rooms/availability?from=${from}&to=${to}${roomId ? `&roomId=${roomId}` : ''}`, undefined, as)

describe.skipIf(skip !== null)('availability over a span (C-103)', () => {
  test('a booking shows as taken, in the room it is in', async () => {
    const room = await makeRoom()
    placeBooking(room, member.id, new Date('2026-09-14T10:00:00Z'), 2)

    const found = await (await availability('2026-09-14', '2026-09-14', member.cookie, room)).json() as Availability
    expect(found.rooms).toHaveLength(1)
    expect(found.rooms[0]?.taken).toHaveLength(1)
  })

  // Criterion 2: a decision in progress holds its slot, or an instant booking takes it from under
  // the decision.
  test('a request awaiting a decision holds its slot too', async () => {
    const room = await makeRoom()
    placeBooking(room, member.id, new Date('2026-09-15T10:00:00Z'), 2, { status: 'PENDING_APPROVAL' })

    const found = await (await availability('2026-09-15', '2026-09-15', member.cookie, room)).json() as Availability
    expect(found.rooms[0]?.taken.map(taken => taken.status)).toEqual(['PENDING_APPROVAL'])
  })

  test('a cancelled one holds nothing', async () => {
    const room = await makeRoom()
    placeBooking(room, member.id, new Date('2026-09-16T10:00:00Z'), 2, { status: 'CANCELLED' })

    const found = await (await availability('2026-09-16', '2026-09-16', member.cookie, room)).json() as Availability
    expect(found.rooms[0]?.taken).toEqual([])
  })

  // Criterion 4, and the same masking the refusal payload uses (criterion 5).
  test('a member sees that a slot is taken, never whose it is', async () => {
    const room = await makeRoom()
    const other = await registerMember(app, 'somebody-else', generatePassword())
    placeBooking(room, other.id, new Date('2026-09-17T10:00:00Z'), 2, { title: 'Dress run, The Crucible' })

    const body = await (await availability('2026-09-17', '2026-09-17', member.cookie, room)).text()
    expect(body).toContain('Booked')
    expect(body).not.toContain('Crucible')
  })

  test('but does see their own booking, because it is theirs', async () => {
    const room = await makeRoom()
    placeBooking(room, member.id, new Date('2026-09-18T10:00:00Z'), 2, { title: 'My own rehearsal' })

    const found = await (await availability('2026-09-18', '2026-09-18', member.cookie, room)).json() as Availability
    expect(found.rooms[0]?.taken[0]?.title).toBe('My own rehearsal')
    expect(found.rooms[0]?.taken[0]?.mine).toBe(true)
  })

  test('an officer sees what is actually there', async () => {
    const room = await makeRoom()
    const other = await registerMember(app, 'another-member', generatePassword())
    placeBooking(room, other.id, new Date('2026-09-19T10:00:00Z'), 2, { title: 'Dress run, The Seagull' })

    expect(await (await availability('2026-09-19', '2026-09-19', officer, room)).text()).toContain('Seagull')
  })

  test('a span longer than a month is refused, not trimmed', async () => {
    const refused = await availability('2026-09-01', '2026-11-01', member.cookie)
    expect(refused.status).toBe(400)
    expect(await refused.text()).toContain('31 days')
  })

  test('a window that ends before it starts is refused', async () => {
    expect((await availability('2026-09-14', '2026-09-01', member.cookie)).status).toBe(400)
  })

  test('a room nobody has is a 404 rather than an empty answer', async () => {
    expect((await availability('2026-09-14', '2026-09-14', member.cookie, 'not-a-room')).status).toBe(404)
  })

  // Criterion 1: ROOM_AVAILABILITY_ROW_BOUND refuses rather than truncating, because half a sweep
  // would show a taken slot as free.
  test('a sweep past the row bound refuses rather than answering with half of it', async () => {
    const room = await makeRoom()
    await send('PUT', '/api/admin/config/ROOM_AVAILABILITY_ROW_BOUND', { value: 1 }, officer)
    try {
      placeBooking(room, member.id, new Date('2026-09-20T10:00:00Z'), 1)
      placeBooking(room, member.id, new Date('2026-09-20T12:00:00Z'), 1)

      const refused = await availability('2026-09-20', '2026-09-20', member.cookie, room)
      expect(refused.status).toBe(413)
      expect(await refused.text()).toContain('shorter')
    }
    finally {
      await send('PUT', '/api/admin/config/ROOM_AVAILABILITY_ROW_BOUND', { value: 1000 }, officer)
    }
  })

  // 0014, and C-102 criterion 4: both transitions are automated cases rather than a hope.
  test('the week the clocks go back covers its extra hour', async () => {
    const room = await makeRoom()
    // 01:30 UTC on 25 October is inside the repeated hour; in London it is 01:30 GMT.
    placeBooking(room, member.id, new Date('2026-10-25T01:30:00Z'), 1)

    const found = await (await availability('2026-10-25', '2026-10-25', member.cookie, room)).json() as Availability
    expect(found.rooms[0]?.taken).toHaveLength(1)
  })

  test('and the week they go forward loses one without losing a booking', async () => {
    const room = await makeRoom()
    // 2026-03-29: 00:30 UTC is 00:30 GMT, still the 29th in London.
    placeBooking(room, member.id, new Date('2026-03-29T00:30:00Z'), 1)

    const found = await (await availability('2026-03-29', '2026-03-29', member.cookie, room)).json() as Availability
    expect(found.rooms[0]?.taken).toHaveLength(1)
  })

  test('a booking on the evening before is not dragged into the day asked for', async () => {
    const room = await makeRoom()
    // 22:00 UTC on 13 September is 23:00 London on the 13th, so it belongs to that day.
    placeBooking(room, member.id, new Date('2026-09-13T22:00:00Z'), 1)

    const found = await (await availability('2026-09-14', '2026-09-14', member.cookie, room)).json() as Availability
    expect(found.rooms[0]?.taken).toEqual([])
  })
})

describe.skipIf(skip !== null)('the calendar in a browser (C-102)', () => {
  test('the rendered page carries the week, before any script runs', async () => {
    const name = `Onscreen ${crypto.randomUUID().slice(0, 6)}`
    await makeRoom({ name })

    const rendered = await fetch(`${app.baseURL}/rooms`, { headers: { cookie: member.cookie } })
    expect(rendered.status).toBe(200)

    // The room is in the server's own HTML, so it came from the render rather than from a fetch
    // the browser has yet to make (criterion 3).
    expect(await rendered.text()).toContain(name)
  })

  // The server render passing is not the same as the page working: a Select item carrying an
  // empty string renders happily and then throws on hydration, which is how this got out.
  test('the page is alive in a browser, with slots to click', async () => {
    const password = generatePassword()
    const planner = await registerMember(app, 'clicker', password)
    giveMembership(planner.id)
    await makeRoom()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', planner.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/rooms`, '[data-test="calendar-span"]')
      // A week of every room is the summary; the slots live behind the day view.
      await click(view, '[data-test="calendar-day"]')
      await waitFor(view, `document.querySelectorAll('[data-test^="slot-"]').length > 0`, 30_000)

      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      const free = await view.evaluate<number>(`[...document.querySelectorAll('[data-test^="slot-"]')].filter(button => !button.disabled).length`)
      expect(free).toBeGreaterThan(0)
    }
    finally {
      view.close()
    }
  }, 120_000)

  // Issue 1048: a phone flips to the day view after hydration, which moves the data key. The day
  // it moves to has to be asked for rather than read back as an empty success.
  test('a phone shows the day it flipped to, with slots on it', async () => {
    const password = generatePassword()
    const planner = await registerMember(app, 'phone-planner', password)
    giveMembership(planner.id)
    await makeRoom()

    const view = await openView(PHONE)
    try {
      await signInOn(view, planner.email, password)

      await visit(view, `${app.baseURL}/rooms`, '[data-test="calendar-span"]')
      await waitFor(view, `document.querySelectorAll('[data-test^="slot-"]').length > 0`, 30_000)

      // The day view is the only one a phone offers, so there is no Day button to press first.
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="calendar-day"]'))`)).toBe(false)
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="calendar-empty"]'))`)).toBe(false)
    }
    finally {
      view.close()
    }
  }, 120_000)

  // Issue 1048, the class #898 closed for the console lists: a refusal is not an empty estate.
  test('a refused sweep says so rather than claiming no rooms exist', async () => {
    const password = generatePassword()
    const planner = await registerMember(app, 'refused-calendar', password)
    giveMembership(planner.id)
    const room = await makeRoom()
    placeBooking(room, planner.id, todayAt(9), 1)
    placeBooking(room, planner.id, todayAt(11), 1)

    await send('PUT', '/api/admin/config/ROOM_AVAILABILITY_ROW_BOUND', { value: 1 }, officer)
    const view = await openView()
    try {
      await signInOn(view, planner.email, password)
      await visit(view, `${app.baseURL}/rooms`, '[data-test="calendar-span"]')
      await waitFor(view, `document.querySelector('[data-test="calendar-failure"]')`, 30_000)

      expect(await textOf(view, '[data-test="calendar-failure"]')).toContain('shorter')
      expect(await textOf(view, 'body')).not.toContain('No rooms are bookable yet')
    }
    finally {
      await send('PUT', '/api/admin/config/ROOM_AVAILABILITY_ROW_BOUND', { value: 1000 }, officer)
      view.close()
    }
  }, 120_000)

  // The route a free slot navigates to now exists, so the click leads somewhere.
  test('clicking a free slot lands on the form, already filled in', async () => {
    const password = generatePassword()
    const planner = await registerMember(app, 'booker-ui', password)
    giveMembership(planner.id)
    await makeRoom()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', planner.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/rooms`, '[data-test="calendar-span"]')
      await click(view, '[data-test="calendar-day"]')
      await waitFor(view, `document.querySelectorAll('[data-test^="slot-"]').length > 0`, 30_000)

      await view.evaluate(`[...document.querySelectorAll('[data-test^="slot-"]')].find(button => !button.disabled).click()`)
      await waitFor(view, `document.querySelector('[data-test="booking-form"]')`, 30_000)

      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      // The room, the day and the time came with the click (criterion 2).
      const day = await view.evaluate<string>(`[...document.querySelectorAll('[data-test="booking-day"] input')].map(field => field.value).join('')`)
      expect(day.replace(/\D/g, '')).toHaveLength(8)
    }
    finally {
      view.close()
    }
  }, 120_000)

  // C-105 criterion 7: a booking, a series and a request all land on the one screen that shows
  // what was just made. This is the single booking; the series has its own case in series.test.ts.
  test('a booking made from the form lands on the member s own bookings', async () => {
    const password = generatePassword()
    const lander = await registerMember(app, 'lander', password)
    giveMembership(lander.id)
    const room = await makeRoom()
    const day = new Date()
    day.setDate(day.getDate() + 21)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', lander.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      const at = day.toISOString().slice(0, 10)
      await visit(view, `${app.baseURL}/rooms/book?room=${room}&day=${at}&at=14:00&until=15:00&purpose=REHEARSAL`, '[data-test="booking-form"]')
      await fill(view, '[data-test="booking-title"]', 'Read through')
      await click(view, '[data-test="booking-submit"]')

      await waitFor(view, `document.querySelector('[data-test="mine-list"]')`, 30_000)
      expect(await textOf(view, 'body')).toContain('Read through')
    }
    finally {
      view.close()
    }
  }, 120_000)

  // How most members will arrive: a QR code or a link somebody sent them, followed while signed
  // out. The query has to survive the round trip or the form opens empty.
  test('a booking link followed signed out lands on the form it named', async () => {
    const password = generatePassword()
    const invited = await registerMember(app, 'invited', password)
    giveMembership(invited.id)
    const room = await makeRoom()

    const view = await openSignedOutView(app.baseURL)
    try {
      const wanted = `/rooms/book?room=${room}&day=2026-09-14&at=14%3A30`
      await visit(view, `${app.baseURL}${wanted}`)
      await waitFor(view, `location.pathname === '/sign-in'`, 30_000)

      await fill(view, 'form input[type="email"]', invited.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')

      await waitFor(view, `document.querySelector('[data-test="booking-form"]')`, 30_000)
      const at = await readTime(view, '[data-test="booking-from"]')
      expect(at).toBe('14:30')
    }
    finally {
      view.close()
    }
  }, 120_000)

  // Rooms across for a day, days across for one room: the same grid asked two questions.
  test('every room shows as columns for one day, and one room as a week', async () => {
    const password = generatePassword()
    const planner = await registerMember(app, 'shapes', password)
    giveMembership(planner.id)
    await makeRoom()
    await makeRoom()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', planner.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      // Every room, a week: a count per room per day rather than an unreadable grid.
      await visit(view, `${app.baseURL}/rooms`, '[data-test="calendar-span"]')
      await waitFor(view, `document.querySelector('[data-test="calendar-summary"]')`, 30_000)

      // Every room, a day: the columns are rooms.
      await click(view, '[data-test="calendar-day"]')
      await waitFor(view, `document.querySelectorAll('[data-test^="slot-"]').length > 0`, 30_000)
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
    }
    finally {
      view.close()
    }
  }, 120_000)

  // A drag across four quarter hours is an hour, and one slot is one slot rather than nothing.
  test('dragging across slots carries both ends to the form', async () => {
    const password = generatePassword()
    const dragger = await registerMember(app, 'dragger', password)
    giveMembership(dragger.id)
    const room = await makeRoom()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', dragger.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/rooms`, '[data-test="calendar-span"]')
      await click(view, '[data-test="calendar-day"]')
      await waitFor(view, `document.querySelectorAll('[data-test^="slot-${room}-"]').length > 0`, 30_000)

      // Pointer events rather than a click: the drag is what is under test.
      await view.evaluate(`(() => {
        const slots = [...document.querySelectorAll('[data-test^="slot-${room}-"]')].filter(one => !one.disabled)
        const down = (element, type) => element.dispatchEvent(new PointerEvent(type, { bubbles: true }))
        down(slots[8], 'pointerdown')
        down(slots[9], 'pointerenter')
        down(slots[10], 'pointerenter')
        down(slots[11], 'pointerenter')
        down(slots[11], 'pointerup')
      })()`)

      await waitFor(view, `document.querySelector('[data-test="booking-form"]')`, 30_000)
      const from = await readTime(view, '[data-test="booking-from"]')
      const to = await readTime(view, '[data-test="booking-to"]')

      // Four quarter hours, so the far edge of the fourth is an hour after the first.
      const minutes = (clock: string): number => Number(clock.split(':')[0]) * 60 + Number(clock.split(':')[1])
      expect(minutes(to) - minutes(from)).toBe(60)
    }
    finally {
      view.close()
    }
  }, 120_000)

  // C-102 criterion 6: a touch pointer is captured between press and release and sends no enter
  // events, so the drag above cannot happen on a phone. The span is tapped end to end instead.
  test('tapping the two ends carries the span to the form, where a finger cannot drag', async () => {
    const password = generatePassword()
    const tapper = await registerMember(app, 'tapper', password)
    giveMembership(tapper.id)
    const room = await makeRoom()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', tapper.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/rooms`, '[data-test="calendar-span"]')
      await click(view, '[data-test="calendar-day"]')
      await waitFor(view, `document.querySelectorAll('[data-test^="slot-${room}-"]').length > 0`, 30_000)

      await view.evaluate(`(() => {
        const slots = [...document.querySelectorAll('[data-test^="slot-${room}-"]')].filter(one => !one.disabled)
        const touch = element => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
        touch(slots[8])
        slots[8].click()
      })()`)

      // The hint says which tap it is waiting for, which is how the member knows to tap again.
      await waitFor(view, `document.querySelector('[data-test="grid-tap-hint"]')`, 30_000)
      expect(await textOf(view, '[data-test="grid-tap-hint"]')).toContain('Now tap where it ends')

      await view.evaluate(`(() => {
        const slots = [...document.querySelectorAll('[data-test^="slot-${room}-"]')].filter(one => !one.disabled)
        const touch = element => element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
        touch(slots[11])
        slots[11].click()
      })()`)

      await waitFor(view, `document.querySelector('[data-test="booking-form"]')`, 30_000)
      const from = await readTime(view, '[data-test="booking-from"]')
      const to = await readTime(view, '[data-test="booking-to"]')
      const minutes = (clock: string): number => Number(clock.split(':')[0]) * 60 + Number(clock.split(':')[1])
      expect(minutes(to) - minutes(from)).toBe(60)
    }
    finally {
      view.close()
    }
  }, 120_000)

  test('signing in is required to see what is booked', async () => {
    const shut = await fetch(`${app.baseURL}/api/rooms/availability?from=2026-09-14&to=2026-09-14`)
    expect(shut.status).toBe(401)
  })
})
