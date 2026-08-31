import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { forgetSpentStep, markVerified, registerMember } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-109. The queue that answers C-108's requests. The old app confirmed double bookings and left
// requests unanswered, which is what the race and the terminal statuses exist to stop (RM-3, RM-4).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let officer = ''
let officerId = ''
let member: TestMember
let memberPassword = ''

// Built by hand rather than through the helper, because the browser case has to sign in as this
// officer and needs its password and its authenticator.
const officerPassword = generatePassword()
const theatreManager = { ...syntheticPerson(109), email: registrableAddress('approver') }
let secret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()

  await send('POST', '/api/auth/register', { email: theatreManager.email, name: theatreManager.name, password: officerPassword }, '')
  markVerified(app, theatreManager.email)
  const first = (await send('POST', '/api/auth/sign-in', { email: theatreManager.email, password: officerPassword }, ''))
    .headers.get('set-cookie')?.split(';')[0] ?? ''
  secret = (await (await send('POST', '/api/account/mfa/enrol', {}, first)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, first)
  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', theatreManager.email, app.databaseFile]).exitCode).toBe(0)

  forgetSpentStep(app, theatreManager.email)
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: theatreManager.email, password: officerPassword }, ''))
    .json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  }, '')
  officer = (answered.headers.get('set-cookie') ?? '').split(';')[0]!
  officerId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', theatreManager.email)!.id
  giveMembership(officerId)

  memberPassword = generatePassword()
  member = await registerMember(app, 'requester', memberPassword)
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

// Placed directly rather than asked for, because what is under test is the deciding.
function placeRequest(roomId: string, userId: string, span: { startsAt: string, endsAt: string }, reason = 'Tech run overran'): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  write(
    `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status, reason)
     VALUES (?, ?, ?, 'Rehearsal', ?, ?, 'GENERAL', 'PENDING_APPROVAL', ?)`,
    id, roomId, userId,
    Math.floor(new Date(span.startsAt).getTime() / 1000),
    Math.floor(new Date(span.endsAt).getTime() / 1000),
    reason,
  )
  return id
}

function statusOf(id: string): string | undefined {
  return read<{ status: string }>('SELECT status FROM room_bookings WHERE id = ?', id)?.status
}

describe.skipIf(skip !== null)('the queue (C-109)', () => {
  test('lists a waiting request with who asked, the span, the room and the reason', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(2), 'The get-in is that morning')

    const answered = await send('GET', '/api/admin/rooms/requests', null, officer)
    const body = await answered.json() as { items: { id: string, requester: string, reason: string, room: string, failures: { reason: string }[] }[] }
    const row = body.items.find(item => item.id === id)

    expect(row).toBeDefined()
    expect(row!.requester).toBe(member.name)
    expect(row!.reason).toBe('The get-in is that morning')
    expect(row!.room).toBeTruthy()
    // Judged now rather than recalled, so a request inside the notice window says so.
    expect(row!.failures.map(failure => failure.reason)).toContain('SHORT_NOTICE')
  })

  test('a member cannot read the queue', async () => {
    const answered = await send('GET', '/api/admin/rooms/requests', null, member.cookie)
    expect(answered.status).toBe(403)
  })

  test('a signed-out visitor cannot read the queue', async () => {
    const answered = await send('GET', '/api/admin/rooms/requests', null, '')
    expect([401, 403]).toContain(answered.status)
  })
})

describe.skipIf(skip !== null)('approving (criterion 1)', () => {
  test('an approval confirms the booking and records who took it', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(3))

    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)
    expect(answered.status).toBe(200)
    expect(statusOf(id)).toBe('CONFIRMED')

    const row = read<{ decided_by: string, decided_at: number }>(
      'SELECT decided_by, decided_at FROM room_bookings WHERE id = ?', id)
    expect(row?.decided_by).toBe(officerId)
    expect(row?.decided_at).toBeGreaterThan(0)
  })

  test('an approval into a different room moves the booking', async () => {
    const asked = await makeRoom()
    const instead = await makeRoom()
    const id = placeRequest(asked, member.id, soon(4))

    const answered = await send('POST', '/api/admin/rooms/requests/decide',
      { ids: [id], action: 'APPROVE', roomId: instead }, officer)
    expect(answered.status).toBe(200)

    const row = read<{ room_id: string, status: string }>('SELECT room_id, status FROM room_bookings WHERE id = ?', id)
    expect(row?.room_id).toBe(instead)
    expect(row?.status).toBe('CONFIRMED')
  })

  test('a move into a room that is taken is refused, and the request stays waiting', async () => {
    const asked = await makeRoom()
    const instead = await makeRoom()
    const span = soon(5)
    const id = placeRequest(asked, member.id, span)
    // Somebody already holds the span in the room it would move into.
    write(
      `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
       VALUES (?, ?, ?, 'Already there', ?, ?, 'GENERAL', 'CONFIRMED')`,
      crypto.randomUUID().replaceAll('-', ''), instead, officerId,
      Math.floor(new Date(span.startsAt).getTime() / 1000),
      Math.floor(new Date(span.endsAt).getTime() / 1000),
    )

    const answered = await send('POST', '/api/admin/rooms/requests/decide',
      { ids: [id], action: 'APPROVE', roomId: instead }, officer)
    const body = await answered.json() as { ok: boolean, outcomes: { why: string, conflicts: unknown[] }[] }

    expect(body.ok).toBe(false)
    expect(body.outcomes[0]!.why).toBe('conflict')
    expect(body.outcomes[0]!.conflicts.length).toBeGreaterThan(0)
    // Never a confirmed double booking, and never silently dropped either (criterion 3).
    expect(statusOf(id)).toBe('PENDING_APPROVAL')
  })

  test('a request does not conflict with itself', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(6))

    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)
    expect((await answered.json() as { ok: boolean }).ok).toBe(true)
    expect(statusOf(id)).toBe('CONFIRMED')
  })
})

describe.skipIf(skip !== null)('rejecting (criterion 2)', () => {
  test('a rejection carries its reason and frees the slot', async () => {
    const room = await makeRoom()
    const span = soon(7)
    const id = placeRequest(room, member.id, span)

    const answered = await send('POST', '/api/admin/rooms/requests/decide',
      { ids: [id], action: 'REJECT', reason: 'The auditorium is in a get-in that evening' }, officer)
    expect(answered.status).toBe(200)

    const row = read<{ status: string, rejection_reason: string }>(
      'SELECT status, rejection_reason FROM room_bookings WHERE id = ?', id)
    expect(row?.status).toBe('REJECTED')
    expect(row?.rejection_reason).toBe('The auditorium is in a get-in that evening')

    // The slot is free, so somebody else may now have it.
    const taken = await send('POST', '/api/rooms/requests', {
      roomId: room,
      title: 'Mine now',
      reason: 'Asking after the refusal',
      ...span,
    }, member.cookie)
    expect(taken.status).toBe(200)
  })

  test('rejecting without a reason is refused', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(8))

    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'REJECT' }, officer)
    expect(answered.status).toBe(400)
    expect(statusOf(id)).toBe('PENDING_APPROVAL')
  })

  test('the requester sees the reason word for word in their own list', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(9))
    await send('POST', '/api/admin/rooms/requests/decide',
      { ids: [id], action: 'REJECT', reason: 'Booked for a workshop' }, officer)

    const answered = await send('GET', '/api/rooms/bookings?when=upcoming', null, member.cookie)
    const body = await answered.json() as { items: { id: string, rejectionReason: string | null }[] }
    expect(body.items.find(item => item.id === id)?.rejectionReason).toBe('Booked for a workshop')
  })
})

describe.skipIf(skip !== null)('what nobody may undo (criterion 5)', () => {
  test('a rejected request cannot be approved afterwards', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(10))
    await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'REJECT', reason: 'No' }, officer)

    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)
    const body = await answered.json() as { ok: boolean, outcomes: { why: string, says: string }[] }
    expect(body.ok).toBe(false)
    expect(body.outcomes[0]!.why).toBe('settled')
    expect(statusOf(id)).toBe('REJECTED')
  })

  test('a cancelled request cannot be approved', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(11))
    await send('POST', `/api/rooms/bookings/${id}/cancel`, {}, member.cookie)

    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)
    expect((await answered.json() as { ok: boolean }).ok).toBe(false)
    expect(statusOf(id)).toBe('CANCELLED')
  })

  test('a request that is no longer there says so rather than failing the whole batch', async () => {
    const room = await makeRoom()
    const kept = placeRequest(room, member.id, soon(12))

    const answered = await send('POST', '/api/admin/rooms/requests/decide',
      { ids: [kept, 'nothingatall'], action: 'APPROVE' }, officer)
    const body = await answered.json() as { ok: boolean, decided: number, outcomes: { id: string, why?: string }[] }

    expect(body.decided).toBe(1)
    expect(body.outcomes.find(outcome => outcome.id === 'nothingatall')?.why).toBe('missing')
    expect(statusOf(kept)).toBe('CONFIRMED')
  })
})

describe.skipIf(skip !== null)('the approval race (criterion 3)', () => {
  // An in-process SQLite serialises writes, so this proves no approval is lost or double-counted
  // rather than that the write itself is atomic under D1 (0022).
  test('two officers approving the same request confirm it once', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(13))

    const answers = await Promise.all(Array.from({ length: 5 }, () =>
      send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)))
    const bodies = await Promise.all(answers.map(answer => answer.json() as Promise<{ decided: number }>))

    expect(bodies.reduce((total, body) => total + body.decided, 0)).toBe(1)
    expect(statusOf(id)).toBe('CONFIRMED')
  })

  test('approving and rejecting at once leaves one decision, not both', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(14))

    const [approved, rejected] = await Promise.all([
      send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer),
      send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'REJECT', reason: 'Clashes' }, officer),
    ])
    const decided = (await approved.json() as { decided: number }).decided
      + (await rejected.json() as { decided: number }).decided

    expect(decided).toBe(1)
    expect(['CONFIRMED', 'REJECTED']).toContain(statusOf(id)!)
  })

  test('a booking that took the slot while a request waited beats the approval', async () => {
    const room = await makeRoom()
    const span = soon(15)
    const id = placeRequest(room, member.id, span)
    // Written straight in, which is the only way to reach the state a bump or an import could:
    // the booking route would refuse it, because the request holds the slot.
    write(
      `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
       VALUES (?, ?, ?, 'Took it first', ?, ?, 'GENERAL', 'CONFIRMED')`,
      crypto.randomUUID().replaceAll('-', ''), room, officerId,
      Math.floor(new Date(span.startsAt).getTime() / 1000),
      Math.floor(new Date(span.endsAt).getTime() / 1000),
    )

    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)
    const body = await answered.json() as { ok: boolean, outcomes: { why: string }[] }

    expect(body.outcomes[0]!.why).toBe('conflict')
    expect(statusOf(id)).toBe('PENDING_APPROVAL')
  })
})

describe.skipIf(skip !== null)('a batch (criterion 4)', () => {
  test('five requests from one member are approved together and told once', async () => {
    const room = await makeRoom()
    const ids = [20, 21, 22, 23, 24].map(day => placeRequest(room, member.id, soon(day)))

    const before = read<{ sent: number }>(
      `SELECT count(*) AS sent FROM notification_log WHERE user_id = ? AND type = 'room.request.approved'`,
      member.id)?.sent ?? 0

    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids, action: 'APPROVE' }, officer)
    expect((await answered.json() as { decided: number }).decided).toBe(5)
    for (const id of ids) expect(statusOf(id)).toBe('CONFIRMED')

    const after = read<{ sent: number }>(
      `SELECT count(*) AS sent FROM notification_log WHERE user_id = ? AND type = 'room.request.approved'`,
      member.id)?.sent ?? 0
    expect(after - before).toBe(1)
  })

  test('two members in one batch get one message each', async () => {
    const room = await makeRoom()
    const second = await registerMember(app, 'second-asker', generatePassword())
    giveMembership(second.id)

    const ids = [
      placeRequest(room, member.id, soon(30)),
      placeRequest(room, member.id, soon(31)),
      placeRequest(room, second.id, soon(32)),
    ]

    const sent = (userId: string): number => read<{ sent: number }>(
      `SELECT count(*) AS sent FROM notification_log WHERE user_id = ? AND type = 'room.request.rejected'`,
      userId)?.sent ?? 0
    const before = [sent(member.id), sent(second.id)]

    await send('POST', '/api/admin/rooms/requests/decide',
      { ids, action: 'REJECT', reason: 'The room is closed that week' }, officer)

    expect(sent(member.id) - before[0]!).toBe(1)
    expect(sent(second.id) - before[1]!).toBe(1)
  })

  test('more than a hundred at a time is refused', async () => {
    const ids = Array.from({ length: 101 }, () => crypto.randomUUID().replaceAll('-', ''))
    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids, action: 'APPROVE' }, officer)
    expect(answered.status).toBe(400)
  })

  test('a member cannot decide on anything', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(40))
    const answered = await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, member.cookie)
    expect(answered.status).toBe(403)
    expect(statusOf(id)).toBe('PENDING_APPROVAL')
  })
})

describe.skipIf(skip !== null)('the trail (criterion 6)', () => {
  test('every decision is recorded with its actor and target', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(41))
    await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)

    const entry = read<{ actor_id: string, action: string, detail: string }>(
      'SELECT actor_id, action, detail FROM audit_log WHERE target = ?', `booking:${id}`)
    expect(entry?.action).toBe('room.request.approved')
    expect(entry?.actor_id).toBe(officerId)
  })

  test('the reason the member gave stays out of the trail', async () => {
    const room = await makeRoom()
    const secret = 'My tutor moved the deadline'
    const id = placeRequest(room, member.id, soon(42), secret)
    await send('POST', '/api/admin/rooms/requests/decide', { ids: [id], action: 'APPROVE' }, officer)

    const entry = read<{ detail: string }>('SELECT detail FROM audit_log WHERE target = ?', `booking:${id}`)
    expect(entry?.detail ?? '').not.toContain(secret)
  })
})

describe.skipIf(skip !== null)('the queue in a browser (C-109)', () => {
  test('an officer approves from the page, and the row leaves the queue', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(50), 'The get-in moved')

    forgetSpentStep(app, theatreManager.email)
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', theatreManager.email)
      await fill(view, 'form input[type="password"]', officerPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)

      const code = await codeForStep(secret, stepFor(new Date()) + 1)
      for (const [index, digit] of [...code].entries()) {
        await fill(view, `[data-test="mfa-challenge"] input:nth-of-type(${index + 1})`, digit)
      }
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`)

      await visit(view, `${app.baseURL}/admin/requests`, '[data-test="requests-table"]')
      // A server render cannot see a hydration failure, so the screen is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      await waitFor(view, `document.querySelector('[data-test="approve-${id}"]')`, 30_000)
      // What it is here for, in the officer's words rather than a code.
      expect(await textOf(view, 'body')).toContain('The get-in moved')

      await click(view, `[data-test="approve-${id}"]`)
      await waitFor(view, `!document.querySelector('[data-test="approve-${id}"]')`, 30_000)
      expect(statusOf(id)).toBe('CONFIRMED')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('rejecting from the page asks for a reason first', async () => {
    const room = await makeRoom()
    const id = placeRequest(room, member.id, soon(51))

    forgetSpentStep(app, theatreManager.email)
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', theatreManager.email)
      await fill(view, 'form input[type="password"]', officerPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)

      const code = await codeForStep(secret, stepFor(new Date()) + 1)
      for (const [index, digit] of [...code].entries()) {
        await fill(view, `[data-test="mfa-challenge"] input:nth-of-type(${index + 1})`, digit)
      }
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`)

      await visit(view, `${app.baseURL}/admin/requests`, '[data-test="requests-table"]')
      await waitFor(view, `document.querySelector('[data-test="reject-${id}"]')`, 30_000)
      await click(view, `[data-test="reject-${id}"]`)
      await waitFor(view, `document.querySelector('[data-test="rejection-reason"]')`, 30_000)

      await fill(view, '[data-test="rejection-reason"]', 'The room is in a get-in that evening')
      await click(view, '[data-test="confirm-rejection"]')
      await waitFor(view, `!document.querySelector('[data-test="reject-${id}"]')`, 30_000)

      const row = read<{ status: string, rejection_reason: string }>(
        'SELECT status, rejection_reason FROM room_bookings WHERE id = ?', id)
      expect(row?.status).toBe('REJECTED')
      expect(row?.rejection_reason).toBe('The room is in a get-in that evening')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
