import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { forgetSpentStep, markVerified, registerMember } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// C-119. A catalogue of rooms the union manages, and what we learned about each the hard way. It
// is a reference, never a bookable estate: nothing here holds a slot or reaches a calendar.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let officer = ''
let member: TestMember
const officerPassword = generatePassword()
// Built by hand, because the browser case signs in as this officer and needs its authenticator.
const theatreManager = { ...syntheticPerson(311), email: registrableAddress('su-catalogue') }
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

  member = await registerMember(app, 'asks-for-su', generatePassword())
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
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

async function listSpace(over: Record<string, unknown> = {}): Promise<string> {
  const answered = await send('POST', '/api/admin/rooms/external-spaces', {
    name: `Portland ${crypto.randomUUID().slice(0, 6)}`,
    building: 'Portland Building',
    campus: 'University Park',
    ...over,
  }, officer)
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const noteIt = (spaceId: string, body: Record<string, unknown>): Promise<Response> =>
  send('PUT', `/api/admin/rooms/external-spaces/${spaceId}/notes`, body, officer)

describe.skipIf(skip !== null)('the catalogue (criterion 1)', () => {
  test('an officer lists a room the union manages', async () => {
    const id = await listSpace({ name: 'Portland B12', capacity: 40, contact: 'SU reception' })

    const held = read<{ name: string, capacity: number, is_active: number }>(
      'SELECT name, capacity, is_active FROM external_spaces WHERE id = ?', id)
    expect(held?.name).toBe('Portland B12')
    expect(held?.capacity).toBe(40)
    expect(held?.is_active).toBe(1)
  })

  test('two rooms cannot share a name, because a catalogue nobody trusts is worse than none', async () => {
    await listSpace({ name: 'Trent C4' })
    const again = await send('POST', '/api/admin/rooms/external-spaces', { name: 'Trent C4' }, officer)
    expect(again.status).toBe(409)
  })

  test('a room is retired, never deleted, so old requests still name something', async () => {
    const id = await listSpace()
    const answered = await send('PUT', `/api/admin/rooms/external-spaces/${id}`,
      { name: 'Gone from the union', isActive: false }, officer)
    expect(answered.status).toBe(200)

    expect(read<{ is_active: number }>('SELECT is_active FROM external_spaces WHERE id = ?', id)?.is_active).toBe(0)
  })

  test('a member cannot list or change one', async () => {
    expect((await send('POST', '/api/admin/rooms/external-spaces', { name: 'Mine' }, member.cookie)).status).toBe(403)
  })

  // Nothing here is a room we control, so nothing here can be booked.
  test('an SU room is not in the bookable estate', async () => {
    const id = await listSpace({ name: 'Not bookable' })
    const rooms = await (await send('GET', '/api/admin/rooms', null, officer)).json() as { items: { id: string }[] }
    expect(rooms.items.some(room => room.id === id)).toBe(false)
  })
})

describe.skipIf(skip !== null)('what we learned about a room (criterion 2)', () => {
  test('a note is against one room and one purpose', async () => {
    const id = await listSpace()
    expect((await noteIt(id, { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'A fixed table fills it' })).status)
      .toBe(200)

    const held = read<{ verdict: string, reason: string }>(
      'SELECT verdict, reason FROM external_space_notes WHERE space_id = ?', id)
    expect(held?.verdict).toBe('UNSUITABLE')
    expect(held?.reason).toBe('A fixed table fills it')
  })

  // The fixed table that ruins a rehearsal is exactly what a meeting wants.
  test('the same room can be no good for one purpose and fine for another', async () => {
    const id = await listSpace()
    await noteIt(id, { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'Fixed table' })
    await noteIt(id, { purpose: 'MEETING', verdict: 'SUITABLE', reason: 'The table is the point' })

    const both = read<{ n: number }>('SELECT count(*) n FROM external_space_notes WHERE space_id = ?', id)
    expect(both?.n).toBe(2)
  })

  test('noting the same purpose twice replaces rather than duplicates', async () => {
    const id = await listSpace()
    await noteIt(id, { purpose: 'REHEARSAL', verdict: 'CAUTION', reason: 'A pillar' })
    await noteIt(id, { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'Two pillars, actually' })

    const held = read<{ n: number, verdict: string, reason: string }>(
      'SELECT count(*) n, verdict, reason FROM external_space_notes WHERE space_id = ?', id)
    expect(held?.n).toBe(1)
    expect(held?.verdict).toBe('UNSUITABLE')
    expect(held?.reason).toBe('Two pillars, actually')
  })

  test('a note needs a reason, because a rumour helps nobody', async () => {
    const id = await listSpace()
    expect((await noteIt(id, { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: '  ' })).status).toBe(400)
  })

  test('a purpose the committee does not list is refused', async () => {
    const id = await listSpace()
    const answered = await noteIt(id, { purpose: 'JUGGLING', verdict: 'UNSUITABLE', reason: 'No' })
    expect(answered.status).toBe(422)
  })

  test('a note can be forgotten', async () => {
    const id = await listSpace()
    await noteIt(id, { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'Fixed table' })

    const removed = await send('DELETE', `/api/admin/rooms/external-spaces/${id}/notes/REHEARSAL`, {}, officer)
    expect(removed.status).toBe(200)
    expect(read<{ n: number }>('SELECT count(*) n FROM external_space_notes WHERE space_id = ?', id)?.n).toBe(0)
  })

  test('the wording stays out of the trail', async () => {
    const id = await listSpace()
    await noteIt(id, { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'The caretaker was unpleasant about it' })

    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE target = ? AND action = 'external.space.note.set'`, `space:${id}`)
    expect(entry?.detail).toContain('REHEARSAL')
    expect(entry?.detail ?? '').not.toContain('caretaker')
  })
})

describe.skipIf(skip !== null)('a member searching (criterion 3)', () => {
  test('search finds a room by name, building or campus', async () => {
    await listSpace({ name: 'Coates C15', building: 'Coates Building', campus: 'University Park' })

    for (const term of ['Coates', 'coates building', 'university park']) {
      const found = await (await send('GET', `/api/rooms/external-spaces?search=${encodeURIComponent(term)}`, null, member.cookie))
        .json() as { items: { name: string }[] }
      expect(found.items.some(item => item.name === 'Coates C15')).toBe(true)
    }
  })

  test('a retired room is not offered', async () => {
    const id = await listSpace({ name: 'Closed for good' })
    await send('PUT', `/api/admin/rooms/external-spaces/${id}`, { name: 'Closed for good', isActive: false }, officer)

    const found = await (await send('GET', '/api/rooms/external-spaces?search=Closed', null, member.cookie))
      .json() as { items: { id: string }[] }
    expect(found.items.some(item => item.id === id)).toBe(false)
  })

  // The member sees the warning, so they can ask for something else before the SU is troubled.
  test('a search for a purpose carries what we know about each room', async () => {
    const id = await listSpace({ name: 'Warned About' })
    await noteIt(id, { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'A fixed table fills it' })

    const found = await (await send('GET', '/api/rooms/external-spaces?search=Warned&purpose=REHEARSAL', null, member.cookie))
      .json() as { items: { id: string, verdict: string | null, warning: string | null }[] }
    const one = found.items.find(item => item.id === id)

    expect(one?.verdict).toBe('UNSUITABLE')
    expect(one?.warning).toContain('A fixed table fills it')
  })

  test('the same room for another purpose is silent', async () => {
    const id = await listSpace({ name: 'Quiet For Meetings' })
    await noteIt(id, { purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'Fixed table' })

    const found = await (await send('GET', '/api/rooms/external-spaces?search=Quiet&purpose=MEETING', null, member.cookie))
      .json() as { items: { id: string, warning: string | null }[] }
    expect(found.items.find(item => item.id === id)?.warning).toBeNull()
  })

  test('the catalogue is never shipped whole', async () => {
    const found = await (await send('GET', '/api/rooms/external-spaces?limit=25', null, member.cookie))
      .json() as { items: unknown[] }
    expect(found.items.length).toBeLessThanOrEqual(25)
  })

  test('a signed-out visitor searches nothing', async () => {
    expect((await send('GET', '/api/rooms/external-spaces?search=Portland', null, '')).status).toBe(401)
  })
})

describe.skipIf(skip !== null)('the screen (C-119)', () => {
  test('an officer lists a room and notes what it is no good for', async () => {
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
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/rooms/manage/other`, '[data-test="spaces-table"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, '[data-test="add-space"]')
      await waitFor(view, `document.querySelector('[data-test="space-name"]')`, 30_000)
      await fill(view, '[data-test="space-name"]', 'Hallward B3')
      await fill(view, '[data-test="space-building"]', 'Hallward Library')
      await click(view, '[data-test="space-submit"]')

      await waitFor(view, `document.body.innerText.includes('Hallward B3')`, 30_000)
      const id = read<{ id: string }>(`SELECT id FROM external_spaces WHERE name = 'Hallward B3'`)!.id

      await click(view, `[data-test="note-${id}"]`)
      await waitFor(view, `document.querySelector('[data-test="note-reason"]')`, 30_000)

      await fill(view, '[data-test="note-reason"]', 'A fixed table fills the room')

      // Opened and picked by what it says: the select is a listbox, not a native one, so setting
      // a value on it does nothing at all.
      await click(view, '[data-test="note-purpose-REHEARSAL"]')

      // The button gates on both fields, so it going live is the readiness signal.
      await waitFor(view, `!document.querySelector('[data-test="note-submit"]').disabled`, 30_000)
      await click(view, '[data-test="note-submit"]')

      await waitFor(view, `document.body.innerText.includes('fixed table')`, 30_000)
      expect(read<{ verdict: string }>('SELECT verdict FROM external_space_notes WHERE space_id = ?', id)?.verdict)
        .toBe('UNSUITABLE')
    }
    finally {
      view.close()
    }
  }, 180_000)
})
