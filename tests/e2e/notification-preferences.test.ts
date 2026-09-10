import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { fromLondonWallClock, londonParts } from '#shared/utils/london'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// H-102. Preferences are per topic, the screen shows every cell with its default, a switched-off
// topic is recorded as suppressed rather than sent, and the inbox is written either way.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let officer = ''
let member: TestMember
let room = ''

const memberPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = (await adminSession(app)).cookie
  member = await registerMember(app, 'muted', memberPassword)
  write(
    `INSERT INTO memberships (id, user_id, starts_on, expires_on, source)
     VALUES (?, ?, date('now', '-30 days'), date('now', '+300 days'), 'MANUAL')`,
    crypto.randomUUID().replaceAll('-', ''), member.id,
  )
  room = await makeRoom()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

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

async function makeRoom(): Promise<string> {
  const answered = await send('POST', '/api/admin/rooms', { name: `Room ${crypto.randomUUID().slice(0, 8)}` }, officer)
  return (await answered.json() as { id: string }).id
}

// Tomorrow in London at the hour asked for, which is the day the room reminder covers (0014).
function tomorrowAt(hour: number): number {
  const { year, month, day } = londonParts(new Date())
  return Math.floor(fromLondonWallClock(year, month, day + 1, hour).getTime() / 1000)
}

function placeBooking(userId: string, startsAt: number, title = 'Rehearsal'): void {
  write(
    `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
     VALUES (?, ?, ?, ?, ?, ?, 'GENERAL', 'CONFIRMED')`,
    crypto.randomUUID().replaceAll('-', ''), room, userId, title, startsAt, startsAt + 7200,
  )
}

const remind = (): Promise<Response> => send('POST', '/api/dev/remind-rooms', {}, officer)

function counted(userId: string, type: string, status: string): number {
  return read<{ n: number }>(
    'SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = ? AND status = ?',
    userId, type, status,
  )?.n ?? 0
}

function inboxCount(userId: string, type: string): number {
  return read<{ n: number }>(
    'SELECT count(*) n FROM inbox_items WHERE user_id = ? AND type = ?', userId, type)?.n ?? 0
}

function clearReminders(): void {
  write(`DELETE FROM notification_log WHERE type = 'room.booking.reminder'`)
  write(`DELETE FROM inbox_items WHERE type = 'room.booking.reminder'`)
}

interface Cell { topic: string, email: boolean, push: boolean, stored: boolean, emailDefault: boolean, pushDefault: boolean }

async function matrix(cookie: string): Promise<Cell[]> {
  const answered = await send('GET', '/api/account/notifications', null, cookie)
  return (await answered.json() as { topics: Cell[] }).topics
}

describe.skipIf(skip !== null)('the preference matrix (criteria 1 and 2)', () => {
  test('every topic has a cell on both channels, with its default', async () => {
    const cells = await matrix(member.cookie)
    expect(cells.map(cell => cell.topic)).toEqual(['BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS'])
    // Nothing stored yet, so every cell is the shipped default: email on, push off.
    expect(cells.every(cell => cell.stored === false)).toBe(true)
    expect(cells.every(cell => cell.email && cell.emailDefault)).toBe(true)
    expect(cells.every(cell => !cell.push && !cell.pushDefault)).toBe(true)
  })

  test('a change is stored per topic per channel and read back as the person\'s own', async () => {
    expect((await send('PUT', '/api/account/notifications', { topic: 'ROOMS', email: false, push: false }, member.cookie)).status).toBe(200)

    const cells = await matrix(member.cookie)
    const rooms = cells.find(cell => cell.topic === 'ROOMS')!
    expect(rooms).toMatchObject({ email: false, push: false, stored: true, emailDefault: true })
    // Only that topic: choosing one is not choosing them all.
    expect(cells.find(cell => cell.topic === 'TRAINING')).toMatchObject({ email: true, stored: false })
  })

  test('a topic that is not one of the five is refused', async () => {
    expect((await send('PUT', '/api/account/notifications', { topic: 'GOSSIP', email: false, push: false }, member.cookie)).status).toBe(400)
  })

  test('a transactional type cannot be named as a topic at all', async () => {
    expect((await send('PUT', '/api/account/notifications', { topic: 'account.verify', email: false, push: false }, member.cookie)).status).toBe(400)
  })

  test('nobody sets anybody else\'s preferences', async () => {
    expect((await send('PUT', '/api/account/notifications', { topic: 'ROOMS', email: false, push: false })).status).toBe(401)
  })

  test('a change takes effect on the next send, and the row is the only thing that moved', async () => {
    expect((await send('PUT', '/api/account/notifications', { topic: 'ROOMS', email: true, push: false }, member.cookie)).status).toBe(200)
    expect(read<{ n: number }>(
      'SELECT count(*) n FROM notification_preferences WHERE user_id = ?', member.id)?.n).toBe(1)
  })
})

describe.skipIf(skip !== null)('a switched-off topic is suppressed, not sent (criterion 3)', () => {
  test('the reminder is recorded as suppressed by preference and never handed over', async () => {
    clearReminders()
    await send('PUT', '/api/account/notifications', { topic: 'ROOMS', email: false, push: false }, member.cookie)
    placeBooking(member.id, tomorrowAt(19), 'Muted rehearsal')

    expect((await remind()).status).toBe(200)

    expect(counted(member.id, 'room.booking.reminder', 'SUPPRESSED_PREFERENCE')).toBe(1)
    expect(counted(member.id, 'room.booking.reminder', 'SENT')).toBe(0)
    // The old shape recorded this as an undeliverable address, which it is not (criterion 3).
    expect(counted(member.id, 'room.booking.reminder', 'SKIPPED_UNDELIVERABLE')).toBe(0)
  }, CASE_TIMEOUT_MS)

  // Criterion 6: the entry is written whatever the email preference says.
  test('the message is still findable in the inbox', async () => {
    expect(inboxCount(member.id, 'room.booking.reminder')).toBe(1)

    const answered = await send('GET', '/api/account/notifications', null, member.cookie)
    const { inbox } = await answered.json() as { inbox: { type: string, title: string }[] }
    expect(inbox.some(item => item.type === 'room.booking.reminder')).toBe(true)
  })

  test('switching it back on delivers the next one', async () => {
    clearReminders()
    await send('PUT', '/api/account/notifications', { topic: 'ROOMS', email: true, push: false }, member.cookie)
    placeBooking(member.id, tomorrowAt(20), 'Audible rehearsal')

    await remind()

    expect(counted(member.id, 'room.booking.reminder', 'SENT')).toBe(1)
    expect(counted(member.id, 'room.booking.reminder', 'SUPPRESSED_PREFERENCE')).toBe(0)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a transactional message ignores all of it (criterion 5)', () => {
  test('with every topic switched off, a password reset still arrives', async () => {
    for (const topic of ['BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS']) {
      await send('PUT', '/api/account/notifications', { topic, email: false, push: false }, member.cookie)
    }

    expect((await send('POST', '/api/auth/password/forgot', { email: member.email })).status).toBe(200)

    expect(counted(member.id, 'password.reset', 'SENT')).toBe(1)
    expect(counted(member.id, 'password.reset', 'SUPPRESSED_PREFERENCE')).toBe(0)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the screen', () => {
  test('one page shows every topic, its default and what a preference cannot silence', async () => {
    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', member.email)
    await fill(view, 'form input[type="password"]', memberPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/account/notifications`, '[data-test="preference-matrix"]')
    await waitFor(view, `document.querySelector('[data-test="topic-ANNOUNCEMENTS"]')`)

    const text = await textOf(view, '[data-test="preference-matrix"]')
    for (const label of ['Bookings', 'Shifts', 'Training', 'Room bookings', 'Committee announcements']) {
      expect(text).toContain(label)
    }
    // The default is visible on the screen as a default (criterion 2).
    expect(text).toContain('On by default')
    expect(text).toContain('Off by default')
    // The inbox is never silenced, and the page says so (criterion 6).
    expect(text).toContain('always on')

    const header = await textOf(view, 'main')
    expect(header).toContain('always arrive')

    view.close()
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
