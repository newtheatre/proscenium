import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword, registrableAddress } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-108's stable QR through the real routes: the confirmation email, the cookie exchange, the
// current-state read and the resend. D-109's entitlement gate rides the same booking flow.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  venueId = venue()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: crypto.randomUUID().slice(0, 8) }).id
  }
  finally {
    database.close()
  }
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

function query<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

function bookerFor(reference: string): string {
  return query<{ userId: string }>('SELECT user_id AS userId FROM reservations WHERE reference = ?', reference)!.userId
}

function confirmationsSent(userId: string): number {
  return query<{ total: number }>(
    'SELECT count(*) AS total FROM notification_log WHERE type = ? AND status = ? AND user_id = ?',
    'reservation.confirmed', 'SENT', userId,
  )?.total ?? 0
}

function giveMembership(userId: string): void {
  write(
    `INSERT INTO memberships (id, user_id, starts_on, expires_on, source)
     VALUES (?, ?, date('now', '-30 days'), date('now', '+300 days'), 'MANUAL')`,
    crypto.randomUUID().replaceAll('-', ''), userId,
  )
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (): number => Math.floor(Date.now() / 1000) + 7 * 86_400

async function bookableShow(ticketTypeOptions: Record<string, unknown> = {}): Promise<{ performanceId: string, ticketTypeId: string }> {
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek() })
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900, ...ticketTypeOptions })
  const ticketTypeId = (await type.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { performanceId, ticketTypeId }
}

async function bookedReservation(performanceId: string, ticketTypeId: string): Promise<{ reference: string, qrToken: string }> {
  const email = registrableAddress('guest')
  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'QR Tester', email },
  }, '')
  expect(answered.status).toBe(200)
  return await answered.json() as { reference: string, qrToken: string }
}

describe.skipIf(skip !== null)('opening the QR link exchanges the token for a cookie (D-108 criterion 4)', () => {
  test('a valid token sets the cookie and redirects to the clean page', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { qrToken } = await bookedReservation(performanceId, ticketTypeId)

    const opened = await fetch(`${app.baseURL}/qr/${qrToken}`, { redirect: 'manual' })
    expect(opened.status).toBe(302)
    expect(opened.headers.get('location')).toBe('/qr')
    const cookie = opened.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('HttpOnly')

    const current = await fetch(`${app.baseURL}/api/qr/current`, { headers: { cookie: cookie.split(';')[0]! } })
    expect(current.status).toBe(200)
    const body = await current.json() as { status: string, totalDue: string | null, qrSvg: string }
    expect(body.status).toBe('PENDING')
    expect(body.totalDue).toBe('£9.00')
    expect(body.qrSvg.length).toBeGreaterThan(0)
  }, CASE_TIMEOUT_MS)

  test('a forged token is refused, with no cookie and no booking to read', async () => {
    const opened = await fetch(`${app.baseURL}/qr/not-a-real-token`, { redirect: 'manual' })
    expect(opened.status).toBe(302)
    expect(opened.headers.get('location')).toBe('/qr?refused=invalid')
    expect(opened.headers.get('set-cookie')).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('with no cookie at all, the current-state read refuses rather than guessing', async () => {
    const current = await fetch(`${app.baseURL}/api/qr/current`)
    expect(current.status).toBe(401)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a resend carries the same QR and answers the same either way (criterion 2)', () => {
  test('the right reference and address sends a second confirmation', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const email = registrableAddress('guest')
    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Resend Tester', email },
    }, '')
    const { reference, qrToken } = await answered.json() as { reference: string, qrToken: string }

    const resent = await send('POST', '/api/reservations/resend', { reference, email }, '')
    expect(resent.status).toBe(200)

    expect(confirmationsSent(bookerFor(reference))).toBe(2)

    // The link handed out a second time still names the same reservation.
    const opened = await fetch(`${app.baseURL}/qr/${qrToken}`, { redirect: 'manual' })
    expect(opened.status).toBe(302)
  }, CASE_TIMEOUT_MS)

  test('the wrong address answers exactly the same and sends nothing more', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const email = registrableAddress('guest')
    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Resend Tester', email },
    }, '')
    const { reference } = await answered.json() as { reference: string }

    const wrongEmail = await send('POST', '/api/reservations/resend', { reference, email: registrableAddress('nobody') }, '')
    const rightAnswer = await send('POST', '/api/reservations/resend', { reference, email }, '')
    const wrongBody = await wrongEmail.json()
    const rightBody = await rightAnswer.json()
    expect(wrongEmail.status).toBe(rightAnswer.status)
    expect(wrongBody).toEqual(rightBody)

    // The original send, plus the one right resend: the wrong-address attempt sent nothing.
    expect(confirmationsSent(bookerFor(reference))).toBe(2)
  }, CASE_TIMEOUT_MS)

  test('an unknown reference answers the same generic message', async () => {
    const answered = await send('POST', '/api/reservations/resend', { reference: 'ZZZZZZ', email: registrableAddress('nobody') }, '')
    expect(answered.status).toBe(200)
    expect(await answered.text()).toContain('If that reference and address match')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a member-restricted ticket type is entitlement-gated (D-109 criterion 1)', () => {
  test('a guest never sees it, and cannot book it by naming its id directly', async () => {
    const { performanceId, ticketTypeId } = await bookableShow({ restrictedTo: 'MEMBER' })

    const booking = await send('GET', `/api/performances/${performanceId}/booking`, undefined, '')
    const listed = await booking.json() as { ticketTypes: { id: string }[] }
    expect(listed.ticketTypes.some(type => type.id === ticketTypeId)).toBe(false)

    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Not A Member', email: registrableAddress('guest') },
    }, '')
    expect(answered.status).toBe(400)
  }, CASE_TIMEOUT_MS)

  test('a current member sees it and books it at its price', async () => {
    const { performanceId, ticketTypeId } = await bookableShow({ restrictedTo: 'MEMBER', price: 500 })
    const member = await registerMember(app, 'member', generatePassword())
    giveMembership(member.id)

    const booking = await send('GET', `/api/performances/${performanceId}/booking`, undefined, member.cookie)
    const listed = await booking.json() as { ticketTypes: { id: string }[] }
    expect(listed.ticketTypes.some(type => type.id === ticketTypeId)).toBe(true)

    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
    }, member.cookie)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { totalPence: number }
    expect(body.totalPence).toBe(500)
  }, CASE_TIMEOUT_MS)
})
