import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { fromLondonWallClock, londonParts } from '#shared/utils/london'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { forgetSpentStep, markVerified, registerMember } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-120. The union may give us any room, whatever preference we put on their form. Nothing here
// holds a slot, and two members may ask for the same evening (0036).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let officerId = ''
let member: TestMember
let other: TestMember
const memberPassword = generatePassword()
const officerPassword = generatePassword()
const theatreManager = { ...syntheticPerson(412), email: registrableAddress('union-manager') }
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
    attemptId, code: await codeForStep(secret, stepFor(new Date())),
  }, '')
  officer = (answered.headers.get('set-cookie') ?? '').split(';')[0]!
  officerId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', theatreManager.email)!.id

  member = await registerMember(app, 'union-asker', memberPassword)
  other = await registerMember(app, 'union-rival', generatePassword())
  giveMembership(member.id)
  giveMembership(other.id)
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

async function listSpace(name: string): Promise<string> {
  const answered = await send('POST', '/api/admin/rooms/external-spaces',
    { name: `${name} ${crypto.randomUUID().slice(0, 5)}`, building: 'Portland Building' }, officer)
  return (await answered.json() as { id: string }).id
}

// Well past the union's notice window, so only the case under test can refuse it.
function span(daysAhead = 30, hour = 18): { startsAt: string, endsAt: string } {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + daysAhead)
  start.setUTCHours(hour, 0, 0, 0)
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 7_200_000).toISOString() }
}

async function ask(over: Record<string, unknown> = {}, as = member.cookie): Promise<string> {
  const answered = await send('POST', '/api/rooms/external-requests', {
    title: 'Weekly rehearsal',
    purpose: 'REHEARSAL',
    ...span(),
    ...over,
  }, as)
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const statusOf = (id: string): string | undefined =>
  read<{ status: string }>('SELECT status FROM external_requests WHERE id = ?', id)?.status

describe.skipIf(skip !== null)('asking, with an optional preference (criterion 1)', () => {
  test('a member asks and nothing is held', async () => {
    const id = await ask()
    expect(statusOf(id)).toBe('REQUESTED')

    const held = read<{ preferred_space_id: string | null, assigned_space_id: string | null }>(
      'SELECT preferred_space_id, assigned_space_id FROM external_requests WHERE id = ?', id)
    expect(held?.preferred_space_id).toBeNull()
    expect(held?.assigned_space_id).toBeNull()
  })

  test('a preference is recorded as a preference, never as the room', async () => {
    const space = await listSpace('Preferred')
    const id = await ask({ preferredSpaceId: space })

    const held = read<{ preferred_space_id: string, assigned_space_id: string | null }>(
      'SELECT preferred_space_id, assigned_space_id FROM external_requests WHERE id = ?', id)
    expect(held?.preferred_space_id).toBe(space)
    expect(held?.assigned_space_id).toBeNull()
  })

  // The whole reason this is not a booking: the union has hundreds of rooms.
  test('two members may ask for the same evening, and both succeed', async () => {
    const when = span(31)
    const mine = await ask(when)
    const theirs = await ask(when, other.cookie)

    expect(statusOf(mine)).toBe('REQUESTED')
    expect(statusOf(theirs)).toBe('REQUESTED')
  })

  test('a union ask does not block a booking of our own, nor the other way round', async () => {
    const when = span(32)
    await ask(when)

    const room = await (await send('POST', '/api/admin/rooms', { name: `Room ${crypto.randomUUID().slice(0, 6)}` }, officer)).json() as { id: string }
    const booked = await send('POST', '/api/rooms/bookings',
      { roomId: room.id, title: 'Ours', purpose: 'REHEARSAL', ...when }, member.cookie)
    expect(booked.status).toBe(200)

    expect((await send('POST', '/api/rooms/external-requests',
      { title: 'And the union too', purpose: 'REHEARSAL', ...when }, member.cookie)).status).toBe(200)
  })

  test('the union needs its notice, and says why', async () => {
    const answered = await send('POST', '/api/rooms/external-requests',
      { title: 'Tomorrow', purpose: 'REHEARSAL', ...span(1) }, member.cookie)

    expect(answered.status).toBe(422)
    expect((await answered.json() as { statusMessage: string }).statusMessage).toContain('union needs')
  })

  test('a lapsed membership cannot ask', async () => {
    const stranger = await registerMember(app, 'no-membership', generatePassword())
    expect((await send('POST', '/api/rooms/external-requests',
      { title: 'Please', purpose: 'REHEARSAL', ...span() }, stranger.cookie)).status).toBe(422)
  })

  test('the member is warned when they prefer a room we know is no good', async () => {
    const space = await listSpace('Fixed Table')
    await send('PUT', `/api/admin/rooms/external-spaces/${space}/notes`,
      { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'A fixed table fills the room' }, officer)

    const answered = await send('POST', '/api/rooms/external-requests', {
      title: 'Asking anyway',
      purpose: 'REHEARSAL',
      preferredSpaceId: space,
      ...span(),
    }, member.cookie)

    expect(answered.status).toBe(200)
    // A warning, never a refusal: it is their preference and the union decides anyway.
    expect((await answered.json() as { warning: string | null }).warning).toContain('fixed table')
  })
})

describe.skipIf(skip !== null)('the form goes in, and the union answers (criteria 2 and 3)', () => {
  test('the whole way through: asked, submitted, given a room, confirmed', async () => {
    const id = await ask()
    const space = await listSpace('Given To Us')

    const submitted = await send('POST', `/api/admin/rooms/external-requests/${id}/submit`,
      { suReference: 'SU-4471' }, officer)
    expect(submitted.status).toBe(200)
    expect(statusOf(id)).toBe('AWAITING_EXTERNAL')

    const assigned = await send('POST', `/api/admin/rooms/external-requests/${id}/assign`,
      { spaceId: space }, officer)
    expect(assigned.status).toBe(200)
    expect(statusOf(id)).toBe('CONFIRMED')

    const held = read<{ assigned_space_id: string, su_reference: string }>(
      'SELECT assigned_space_id, su_reference FROM external_requests WHERE id = ?', id)
    expect(held?.assigned_space_id).toBe(space)
    expect(held?.su_reference).toBe('SU-4471')
  })

  test('a room cannot be recorded before the form is in', async () => {
    const id = await ask()
    const space = await listSpace('Too Early')
    const answered = await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: space }, officer)

    expect(answered.status).toBe(409)
    expect(statusOf(id)).toBe('REQUESTED')
  })

  test('the form cannot go in twice', async () => {
    const id = await ask()
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    expect((await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)).status).toBe(409)
  })

  test('every step is on the trail', async () => {
    const id = await ask()
    const space = await listSpace('Trailed')
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: space }, officer)

    const actions = all<{ action: string }>(
      'SELECT action FROM audit_log WHERE target = ? ORDER BY created_at', `external:${id}`).map(one => one.action)
    expect(actions).toContain('external.requested')
    expect(actions).toContain('external.request.submitted')
    expect(actions).toContain('external.request.assigned')
  })

  test('a member cannot drive any of it', async () => {
    const id = await ask()
    for (const verb of ['submit', 'assign', 'refuse-assignment', 'reject']) {
      expect((await send('POST', `/api/admin/rooms/external-requests/${id}/${verb}`, { spaceId: 'x', reason: 'x' }, member.cookie)).status)
        .toBe(403)
    }
  })
})

describe.skipIf(skip !== null)('a room we know is no good (criterion 4)', () => {
  async function withNote(purpose = 'REHEARSAL'): Promise<{ id: string, space: string }> {
    const space = await listSpace('Meeting Room')
    await send('PUT', `/api/admin/rooms/external-spaces/${space}/notes`,
      { purpose, verdict: 'UNSUITABLE', reason: 'A fixed table fills the room' }, officer)
    const id = await ask()
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    return { id, space }
  }

  // The spreadsheet check, made into a refusal rather than a warning that gets read past.
  test('recording it is refused, and the refusal carries the note', async () => {
    const { id, space } = await withNote()
    const answered = await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: space }, officer)

    expect(answered.status).toBe(409)
    const body = await answered.json() as { data: { needsDespite: boolean, note: { reason: string } } }
    expect(body.data.needsDespite).toBe(true)
    expect(body.data.note.reason).toContain('fixed table')
    expect(statusOf(id)).toBe('AWAITING_EXTERNAL')
  })

  test('and goes through when it is asserted past', async () => {
    const { id, space } = await withNote()
    const answered = await send('POST', `/api/admin/rooms/external-requests/${id}/assign`,
      { spaceId: space, despite: true }, officer)

    expect(answered.status).toBe(200)
    expect(statusOf(id)).toBe('CONFIRMED')

    // That a note existed and was overridden, never its wording.
    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE target = ? AND action = 'external.request.assigned'`, `external:${id}`)
    expect(entry?.detail).toContain('overrode')
    expect(entry?.detail ?? '').not.toContain('fixed table')
  })

  test('a note about another purpose does not stand in the way', async () => {
    const { id, space } = await withNote('MEETING')
    expect((await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: space }, officer)).status)
      .toBe(200)
  })
})

describe.skipIf(skip !== null)('asking the union again (criterion 5)', () => {
  test('a refused room is kept, the request stays with the union, and the member is told', async () => {
    const id = await ask()
    const bad = await listSpace('No Good')
    const good = await listSpace('Better')
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)

    const refused = await send('POST', `/api/admin/rooms/external-requests/${id}/refuse-assignment`, {
      spaceId: bad,
      reason: 'A fixed table fills it',
      note: { verdict: 'UNSUITABLE', reason: 'A fixed table fills the room' },
    }, officer)
    expect(refused.status).toBe(200)
    // Still with the union: we have asked them again, not given up.
    expect(statusOf(id)).toBe('AWAITING_EXTERNAL')

    await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: good }, officer)
    expect(statusOf(id)).toBe('CONFIRMED')

    // Both offers survive, which is what the spreadsheet never did.
    const offers = all<{ outcome: string }>(
      'SELECT outcome FROM external_assignments WHERE request_id = ? ORDER BY recorded_at', id)
    expect(offers.map(one => one.outcome)).toEqual(['REFUSED', 'ACCEPTED'])
  })

  // The blacklist builds itself out of the work rather than being a chore somebody remembers.
  test('refusing writes the suitability note in the same action', async () => {
    const id = await ask()
    const bad = await listSpace('Learned From')
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)

    await send('POST', `/api/admin/rooms/external-requests/${id}/refuse-assignment`, {
      spaceId: bad,
      reason: 'Carpet, and a pillar',
      note: { verdict: 'UNSUITABLE', reason: 'Carpeted, with a pillar in the middle' },
    }, officer)

    const note = read<{ verdict: string, reason: string }>(
      'SELECT verdict, reason FROM external_space_notes WHERE space_id = ?', bad)
    expect(note?.verdict).toBe('UNSUITABLE')
    expect(note?.reason).toContain('pillar')
  })

  test('and may decline to write one', async () => {
    const id = await ask()
    const bad = await listSpace('One Off')
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)

    await send('POST', `/api/admin/rooms/external-requests/${id}/refuse-assignment`,
      { spaceId: bad, reason: 'Double booked that evening' }, officer)

    expect(read<{ n: number }>('SELECT count(*) n FROM external_space_notes WHERE space_id = ?', bad)?.n).toBe(0)
  })

  test('refusing needs a reason', async () => {
    const id = await ask()
    const bad = await listSpace('Silent')
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    expect((await send('POST', `/api/admin/rooms/external-requests/${id}/refuse-assignment`,
      { spaceId: bad, reason: '  ' }, officer)).status).toBe(400)
  })
})

describe.skipIf(skip !== null)('turning one down, and withdrawing one', () => {
  test('a rejection carries its reason to the member', async () => {
    const id = await ask()
    await send('POST', `/api/admin/rooms/external-requests/${id}/reject`,
      { reason: 'We have the studio free that evening' }, officer)

    expect(statusOf(id)).toBe('REJECTED')
    const listing = await (await send('GET', '/api/rooms/external-requests?when=upcoming', null, member.cookie))
      .json() as { items: { id: string, rejectionReason: string | null }[] }
    expect(listing.items.find(one => one.id === id)?.rejectionReason).toBe('We have the studio free that evening')
  })

  test('a member withdraws their own, and nobody else s', async () => {
    const id = await ask()
    expect((await send('POST', `/api/rooms/external-requests/${id}/cancel`, {}, other.cookie)).status).toBe(404)
    expect((await send('POST', `/api/rooms/external-requests/${id}/cancel`, {}, member.cookie)).status).toBe(200)
    expect(statusOf(id)).toBe('CANCELLED')
  })

  // Our booking with the union stands until a person cancels it with them, which is the gap
  // docs/known-issues.md recorded and this closes.
  test('withdrawing one the union already has tells the approvers', async () => {
    const id = await ask()
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, { suReference: 'SU-9000' }, officer)

    const before = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'external.request.withdrawn'`,
      officerId)?.n ?? 0

    const answered = await send('POST', `/api/rooms/external-requests/${id}/cancel`, {}, member.cookie)
    expect((await answered.json() as { unionTold: boolean }).unionTold).toBe(true)

    expect((read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'external.request.withdrawn'`,
      officerId)?.n ?? 0) - before).toBe(1)
  })

  test('withdrawing one that never went does not trouble anybody', async () => {
    const id = await ask()
    const answered = await send('POST', `/api/rooms/external-requests/${id}/cancel`, {}, member.cookie)
    expect((await answered.json() as { unionTold: boolean }).unionTold).toBe(false)
  })

  test('a settled request is the end of it', async () => {
    const id = await ask()
    await send('POST', `/api/rooms/external-requests/${id}/cancel`, {}, member.cookie)

    for (const verb of ['submit', 'reject']) {
      expect((await send('POST', `/api/admin/rooms/external-requests/${id}/${verb}`, { reason: 'x' }, officer)).status)
        .toBe(409)
    }
  })
})

describe.skipIf(skip !== null)('two officers at once', () => {
  // An in-process SQLite serialises writes, so this proves the step is taken once rather than
  // that the write is atomic under D1 (0022).
  test('the form goes in once, not three times', async () => {
    const id = await ask()
    const answers = await Promise.all(Array.from({ length: 3 }, () =>
      send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)))

    expect(answers.filter(one => one.status === 200)).toHaveLength(1)
    expect(statusOf(id)).toBe('AWAITING_EXTERNAL')
  })
})

describe.skipIf(skip !== null)('the screens (C-120)', () => {
  test('a member asks, and sees it on their own page', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', memberPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`)

      const day = new Date()
      day.setUTCDate(day.getUTCDate() + 40)
      const asDay = day.toISOString().slice(0, 10)

      await visit(view, `${app.baseURL}/rooms/external?day=${asDay}&purpose=REHEARSAL`, '[data-test="external-title"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await fill(view, '[data-test="external-title"]', 'Asked from a browser')
      await waitFor(view, `!document.querySelector('[data-test="external-submit"]').disabled`, 30_000)
      await click(view, '[data-test="external-submit"]')

      await waitFor(view, `document.querySelector('[data-test="union-list"]')`, 30_000)
      expect(await textOf(view, 'body')).toContain('Waiting to go to the union')

      expect(read<{ status: string }>(
        `SELECT status FROM external_requests WHERE title = 'Asked from a browser'`)?.status).toBe('REQUESTED')
    }
    finally {
      view.close()
    }
  }, 180_000)

  test('an officer sends the form and records what the union gave us', async () => {
    const id = await ask({ title: 'Driven from the queue' })
    const space = await listSpace('Queue Room')
    const spaceName = read<{ name: string }>('SELECT name FROM external_spaces WHERE id = ?', space)!.name

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

      await visit(view, `${app.baseURL}/admin/su-requests`, '[data-test="su-requests-table"]')
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, `[data-test="submit-${id}"]`)
      await waitFor(view, `document.querySelector('[data-test="submit-confirm"]')`, 30_000)
      await fill(view, '[data-test="submit-reference"]', 'SU-1234')
      await click(view, '[data-test="submit-confirm"]')
      await waitFor(view, `document.querySelector('[data-test="assign-${id}"]')`, 30_000)
      expect(statusOf(id)).toBe('AWAITING_EXTERNAL')

      await click(view, `[data-test="assign-${id}"]`)
      // The combobox inside the open dialog: the attribute lands on the menu, not on its field.
      await waitFor(view, `document.querySelector('[role="dialog"] input[role="combobox"]')`, 30_000)
      await fill(view, '[role="dialog"] input[role="combobox"]', spaceName.slice(0, 8))
      await waitFor(view, `document.querySelectorAll('[role="option"]').length > 0`, 30_000)
      await view.evaluate(`document.querySelector('[role="option"]').click()`)
      await waitFor(view, `!document.querySelector('[data-test="assign-confirm"]').disabled`, 30_000)
      await click(view, '[data-test="assign-confirm"]')

      await waitFor(view, `!document.querySelector('[data-test="assign-${id}"]')`, 30_000)
      expect(statusOf(id)).toBe('CONFIRMED')
    }
    finally {
      view.close()
    }
  }, 180_000)
})

describe.skipIf(skip !== null)('a union room reaches the rest of the system', () => {
  async function confirmed(daysAhead: number): Promise<{ id: string, space: string, name: string }> {
    const id = await ask(span(daysAhead))
    const space = await listSpace('Reaches')
    const name = read<{ name: string }>('SELECT name FROM external_spaces WHERE id = ?', space)!.name
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: space }, officer)
    return { id, space, name }
  }

  // A room the union gave us is a commitment like any other, so it belongs in the same calendar.
  test('a confirmed one is in the member s calendar feed', async () => {
    const { name } = await confirmed(35)
    const { url } = await (await send('POST', '/api/account/room-feed', {}, member.cookie)).json() as { url: string }

    const calendar = await (await fetch(url)).text()
    expect(calendar).toContain(name)
    expect(calendar).toContain('STATUS:CONFIRMED')
  })

  test('one still with the union is tentative, because they may yet say no', async () => {
    const id = await ask(span(36))
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)

    const { url } = await (await send('POST', '/api/account/room-feed', {}, member.cookie)).json() as { url: string }
    const calendar = await (await fetch(url)).text()

    const event = calendar.split('BEGIN:VEVENT').find(part => part.includes(id))
    expect(event).toBeDefined()
    expect(event).toContain('STATUS:TENTATIVE')
  })

  test('and somebody else s is in nobody else s feed', async () => {
    await confirmed(37)
    const { url } = await (await send('POST', '/api/account/room-feed', {}, other.cookie)).json() as { url: string }
    expect(await (await fetch(url)).text()).not.toContain('Reaches')
  })

  // Nobody is reminded about our own rooms and left to forget a union one.
  test('a confirmed one tomorrow is reminded about', async () => {
    const id = await ask(span(30))
    const space = await listSpace('Reminded')
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: space }, officer)

    // Moved to tomorrow directly, because the union needs ten days' notice to be asked at all.
    const { year, month, day } = londonParts(new Date())
    const at = Math.floor(fromLondonWallClock(year, month, day + 1, 19).getTime() / 1000)
    write('UPDATE external_requests SET starts_at = ?, ends_at = ? WHERE id = ?', at, at + 7200, id)
    write(`DELETE FROM notification_log WHERE type = 'room.booking.reminder'`)

    const answered = await send('POST', '/api/dev/remind-rooms', {}, officer)
    expect(answered.status).toBe(200)

    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'room.booking.reminder'`,
      member.id)?.n).toBe(1)
  })

  // Escalated, never expired: expiry frees a held slot and this holds none (0036).
  test('one left waiting chases the approvers, and never lapses', async () => {
    const id = await ask(span(38))
    write('UPDATE external_requests SET created_at = ? WHERE id = ?',
      Math.floor(Date.now() / 1000) - 30 * 86_400, id)

    const before = read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'external.request.waiting'`,
      officerId)?.n ?? 0

    const answered = await send('POST', '/api/dev/sweep-requests', {}, officer)
    expect((await answered.json() as { unionEscalated: number }).unionEscalated).toBeGreaterThan(0)

    expect((read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'external.request.waiting'`,
      officerId)?.n ?? 0) - before).toBeGreaterThan(0)

    // Still open: the union may yet answer.
    expect(statusOf(id)).toBe('REQUESTED')
  })

  test('and is chased once, not every night', async () => {
    const id = await ask(span(39))
    write('UPDATE external_requests SET created_at = ? WHERE id = ?',
      Math.floor(Date.now() / 1000) - 30 * 86_400, id)

    await send('POST', '/api/dev/sweep-requests', {}, officer)
    const after = await (await send('POST', '/api/dev/sweep-requests', {}, officer)).json() as { unionEscalated: number }

    expect(read<{ escalated_at: number | null }>(
      'SELECT escalated_at FROM external_requests WHERE id = ?', id)?.escalated_at).not.toBeNull()
    expect(after.unionEscalated).toBe(0)
  })
})

// The union moving us room to room after confirming is ordinary, and until C-120 the room they
// gave us could never be corrected once the request was confirmed.
describe('the union changing its mind after it answered', () => {
  async function confirmedOn(daysAhead: number): Promise<{ id: string, space: string }> {
    const id = await ask(span(daysAhead))
    const space = await listSpace('Changed')
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: space }, officer)
    expect(statusOf(id)).toBe('CONFIRMED')
    return { id, space }
  }

  test('a confirmed request can be moved to the room they actually gave us', async () => {
    const { id } = await confirmedOn(41)
    const instead = await listSpace('Instead')

    const answered = await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: instead }, officer)
    expect(answered.status).toBe(200)
    expect(statusOf(id)).toBe('CONFIRMED')
    expect(read<{ assigned_space_id: string }>(
      'SELECT assigned_space_id FROM external_requests WHERE id = ?', id)?.assigned_space_id).toBe(instead)
  })

  // A room refused after confirming is still a room we no longer have, so the request goes back
  // to waiting on the union rather than standing as a booking we cannot use.
  test('refusing a confirmed room sends it back and forgets the room', async () => {
    const { id, space } = await confirmedOn(42)

    const answered = await send('POST', `/api/admin/rooms/external-requests/${id}/refuse-assignment`, {
      spaceId: space,
      reason: 'A meeting room with a fixed table',
      note: { verdict: 'UNSUITABLE', reason: 'Fixed table, no floor space' },
    }, officer)
    expect(answered.status).toBe(200)

    expect(statusOf(id)).toBe('AWAITING_EXTERNAL')
    expect(read<{ assigned_space_id: string | null }>(
      'SELECT assigned_space_id FROM external_requests WHERE id = ?', id)?.assigned_space_id).toBeNull()

    // The refusal is a privileged mutation, so it leaves a trail like its peers.
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE target = ? AND action = 'external.space.note.set'`,
      `space:${space}`)?.n).toBe(1)
  })

  test('and a settled request is refused rather than reopened', async () => {
    const id = await ask(span(43))
    await send('POST', `/api/rooms/external-requests/${id}/cancel`, {}, member.cookie)

    const answered = await send('POST', `/api/admin/rooms/external-requests/${id}/refuse-assignment`, {
      spaceId: await listSpace('Never'), reason: 'Too late',
    }, officer)
    expect(answered.status).toBe(409)
    expect(statusOf(id)).toBe('CANCELLED')
  })

  // Escalation is per waiting spell, so one sent back to the union is chased again rather than
  // being counted as already chased months ago.
  test('sending it to the union again resets the chase', async () => {
    const id = await ask(span(44))
    write('UPDATE external_requests SET created_at = ? WHERE id = ?',
      Math.floor(Date.now() / 1000) - 30 * 86_400, id)
    await send('POST', '/api/dev/sweep-requests', {}, officer)
    expect(read<{ escalated_at: number | null }>(
      'SELECT escalated_at FROM external_requests WHERE id = ?', id)?.escalated_at).not.toBeNull()

    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    expect(read<{ escalated_at: number | null }>(
      'SELECT escalated_at FROM external_requests WHERE id = ?', id)?.escalated_at).toBeNull()
  })
})

// The queue is a list of work: an answered request from last term is a lookup, not the top of it.
describe('what the officer sees first', () => {
  test('open requests come before settled ones', async () => {
    const settled = await ask(span(45))
    await send('POST', `/api/rooms/external-requests/${settled}/cancel`, {}, member.cookie)
    const open = await ask(span(46))

    const answered = await send('GET', '/api/admin/rooms/external-requests?when=all', undefined, officer)
    const { items } = await answered.json() as { items: { id: string, status: string }[] }

    const firstSettled = items.findIndex(one => one.status === 'CANCELLED')
    expect(items.findIndex(one => one.id === open)).toBeLessThan(firstSettled)
    expect(items.some(one => one.id === settled)).toBe(true)
  })

  test('and every offer arrives with the request, however many there are', async () => {
    const id = await ask(span(47))
    const space = await listSpace('Offered')
    await send('POST', `/api/admin/rooms/external-requests/${id}/submit`, {}, officer)
    await send('POST', `/api/admin/rooms/external-requests/${id}/assign`, { spaceId: space }, officer)
    await send('POST', `/api/admin/rooms/external-requests/${id}/refuse-assignment`, {
      spaceId: space, reason: 'No floor space',
    }, officer)

    const answered = await send('GET', '/api/admin/rooms/external-requests?when=all', undefined, officer)
    const { items, more } = await answered.json() as {
      items: { id: string, offers: { outcome: string }[] }[]
      more: boolean
    }

    const one = items.find(row => row.id === id)!
    expect(one.offers.map(offer => offer.outcome)).toEqual(['ACCEPTED', 'REFUSED'])
    expect(more).toBe(false)
  })
})
