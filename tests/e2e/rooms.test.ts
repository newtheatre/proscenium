import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// C-101. The bookable estate reflects reality: a room is retired rather than deleted, its hours
// belong to it, and its capacity warns without refusing.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let cookie = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie
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

const send = (method: string, path: string, body?: unknown, as = cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

interface Listing { items: { id: string, name: string, isActive: boolean, hours: unknown[] }[], total: number }

async function addRoom(name: string, over: Record<string, unknown> = {}): Promise<string> {
  const answered = await send('POST', '/api/admin/rooms', { name, ...over })
  const { id } = await answered.json() as { id: string }
  return id
}

describe.skipIf(skip !== null)('describing the bookable estate (C-101)', () => {
  test('a room is added with its opening hours, and they belong to it', async () => {
    const id = await addRoom(`Studio ${crypto.randomUUID().slice(0, 6)}`, {
      capacity: 40,
      hours: [
        { weekday: 1, opens: '09:00', closes: '22:00' },
        { weekday: 2, opens: '09:00', closes: '22:00' },
      ],
    })

    const listing = await (await send('GET', '/api/admin/rooms')).json() as Listing
    const room = listing.items.find(one => one.id === id)
    expect(room?.hours).toHaveLength(2)
  })

  test('a weekday with no hours is closed, and is stored as no row at all', async () => {
    const id = await addRoom(`Closed ${crypto.randomUUID().slice(0, 6)}`, {
      hours: [{ weekday: 1, opens: '10:00', closes: '12:00' }],
    })

    const count = read<{ n: number }>('SELECT count(*) n FROM room_hours WHERE room_id = ?', id)
    expect(count?.n).toBe(1)
  })

  test('hours that close before they open are refused', async () => {
    const refused = await send('POST', '/api/admin/rooms', {
      name: `Backwards ${crypto.randomUUID().slice(0, 6)}`,
      hours: [{ weekday: 1, opens: '22:00', closes: '09:00' }],
    })
    expect(refused.status).toBe(400)
  })

  // Criterion 1: every change is audited with a from/to diff.
  test('a change is audited saying what it was and what it became', async () => {
    const id = await addRoom(`Rename ${crypto.randomUUID().slice(0, 6)}`, { capacity: 20 })
    await send('PUT', `/api/admin/rooms/${id}`, { name: 'The Rehearsal Room', capacity: 35 })

    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE action = 'room.updated' AND target = ? ORDER BY created_at DESC LIMIT 1`,
      `room:${id}`)
    const detail = JSON.parse(entry!.detail) as Record<string, [unknown, unknown]>

    expect(detail.capacity).toEqual([20, 35])
    expect(detail.name?.[1]).toBe('The Rehearsal Room')
  })

  // Criterion 2 and 4: retired, never deleted, and gone from what a member is offered.
  test('retiring a room keeps it and takes it off the active list', async () => {
    const id = await addRoom(`Retiring ${crypto.randomUUID().slice(0, 6)}`)

    expect((await send('DELETE', `/api/admin/rooms/${id}`)).status).toBe(200)
    expect(read('SELECT id FROM rooms WHERE id = ?', id)).toBeDefined()

    const active = await (await send('GET', '/api/admin/rooms')).json() as Listing
    expect(active.items.some(room => room.id === id)).toBe(false)

    const all = await (await send('GET', '/api/admin/rooms?includeInactive=true')).json() as Listing
    expect(all.items.some(room => room.id === id)).toBe(true)
  })

  test('retiring one twice is not an error, because the outcome is what was asked for', async () => {
    const id = await addRoom(`Twice ${crypto.randomUUID().slice(0, 6)}`)
    await send('DELETE', `/api/admin/rooms/${id}`)

    const again = await send('DELETE', `/api/admin/rooms/${id}`)
    expect(again.status).toBe(200)
    expect((await again.json() as { alreadyRetired: boolean }).alreadyRetired).toBe(true)
  })

  test('two rooms cannot share a name', async () => {
    const name = `Unique ${crypto.randomUUID().slice(0, 6)}`
    await addRoom(name)
    expect((await send('POST', '/api/admin/rooms', { name })).status).toBeGreaterThanOrEqual(400)
  })

  test('a room nobody has needs a 404, not a silent success', async () => {
    expect((await send('PUT', '/api/admin/rooms/not-a-room', { name: 'Nowhere' })).status).toBe(404)
    expect((await send('DELETE', '/api/admin/rooms/not-a-room')).status).toBe(404)
  })

  // Criterion 3, in the terms the estate uses: a room somebody else manages, not a "venue".
  test('an external room records where it is and who to ask', async () => {
    const id = await addRoom(`Portland ${crypto.randomUUID().slice(0, 6)}`, {
      isExternal: true,
      campus: 'University Park',
      building: 'Portland Building',
      contact: 'SU reception, portland@example.invalid',
    })

    const listing = await (await send('GET', '/api/admin/rooms')).json() as Listing
    const room = listing.items.find(one => one.id === id) as { isExternal: boolean, campus: string } | undefined

    expect(room?.isExternal).toBe(true)
    expect(room?.campus).toBe('University Park')
  })

  test('an internal room says nothing about a campus it does not have', async () => {
    const id = await addRoom(`Internal ${crypto.randomUUID().slice(0, 6)}`)
    const row = read<{ isExternal: number, campus: string | null }>(
      'SELECT is_external AS isExternal, campus FROM rooms WHERE id = ?', id)

    expect(row?.isExternal).toBe(0)
    expect(row?.campus).toBeNull()
  })

  test('turning a room external is a change the trail names', async () => {
    const id = await addRoom(`Moving ${crypto.randomUUID().slice(0, 6)}`)
    await send('PUT', `/api/admin/rooms/${id}`, { name: 'Moving', isExternal: true, campus: 'Jubilee' })

    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE action = 'room.updated' AND target = ? ORDER BY created_at DESC LIMIT 1`,
      `room:${id}`)
    const detail = JSON.parse(entry!.detail) as Record<string, [unknown, unknown]>

    expect(detail.isExternal).toEqual([false, true])
    expect(detail.campus?.[1]).toBe('Jubilee')
  })

  // The bug as reported. On the server $fetch carries no cookies, so the render came back
  // unauthenticated and hydration, holding data already, never asked again.
  test('the rendered page has the rooms in it, before any script runs', async () => {
    const name = `Onload ${crypto.randomUUID().slice(0, 6)}`
    await addRoom(name)

    const rendered = await fetch(`${app.baseURL}/admin/rooms`, { headers: { cookie } })
    expect(rendered.status).toBe(200)
    expect(await rendered.text()).toContain(name)
  })

  test('describing the estate needs the permission', async () => {
    const stranger = await adminSession(app, { roles: [] })
    expect((await send('GET', '/api/admin/rooms', undefined, stranger.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/rooms', { name: 'Sneaky' }, stranger.cookie)).status).toBe(403)
  })
})
