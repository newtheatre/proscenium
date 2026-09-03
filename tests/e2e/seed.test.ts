import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// K-120. The script hashes outside Nuxt, so signing in as a seeded person is the only thing that
// proves its scrypt and the application's agree.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
const seeded: { email: string, password: string }[] = []
// Read once, beside the seed run: recomputing it in a test would flake for the minute after 04:00.
let seededNight = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()

  const ran = Bun.spawnSync(['bun', 'scripts/seed.ts', app.databaseFile], { stdout: 'pipe', stderr: 'pipe' })
  const said = `${ran.stdout.toString()}${ran.stderr.toString()}`
  expect(ran.exitCode).toBe(0)

  // The credentials are printed once and nowhere else, so reading them back means reading them
  // out of what the command said.
  const lines = said.split('\n').map(line => line.trim())
  for (const [index, line] of lines.entries()) {
    if (line.includes('@') && lines[index + 1]?.startsWith('test-')) {
      seeded.push({ email: line, password: lines[index + 1]! })
    }
  }
  seededNight = currentShowNight()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function rows<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
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

describe.skipIf(skip !== null)('seeded data is usable (K-120)', () => {
  test('it printed credentials for everybody it made', () => {
    expect(seeded.length).toBeGreaterThan(0)
    expect(read<{ n: number }>('SELECT count(*) n FROM users WHERE name LIKE ?', '%(test)%')?.n)
      .toBe(seeded.length)
  })

  // The whole point: the script hashes outside Nuxt, and this is what proves the two agree.
  test('a seeded password signs in', async () => {
    const person = seeded[0]!
    const answered = await fetch(`${app.baseURL}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: person.email, password: person.password }),
    })

    expect(answered.status).toBe(200)
    expect(answered.headers.get('set-cookie')).toContain('nnt-session')
  })

  test('a seeded member holds a membership, so they can book', async () => {
    const person = seeded[0]!
    const held = read<{ n: number }>(`
      SELECT count(*) n FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email = ?`, person.email)
    expect(held?.n).toBe(1)
  })

  test('the rooms and a week of bookings are there', () => {
    expect(read<{ n: number }>('SELECT count(*) n FROM rooms')?.n).toBeGreaterThanOrEqual(3)
    // Union rooms are a catalogue, not rooms: seeded so the SU screens have something to show,
    // with a note apiece so the suitability warning is reachable by hand (0036).
    expect(read<{ n: number }>('SELECT count(*) n FROM external_spaces')?.n).toBeGreaterThan(0)
    expect(read<{ n: number }>('SELECT count(*) n FROM external_space_notes')?.n).toBeGreaterThan(0)
    expect(read<{ n: number }>('SELECT count(*) n FROM room_bookings')?.n).toBeGreaterThan(0)
    // One waiting on a decision, so the pending state has something to show.
    expect(read<{ n: number }>(`SELECT count(*) n FROM room_bookings WHERE status = 'PENDING_APPROVAL'`)?.n)
      .toBeGreaterThan(0)
  })

  // Wave 0 contract (d): every show-night and box-office screen needs a night to open on.
  test('there is a venue, a show, and a performance tonight', () => {
    expect(read<{ n: number }>('SELECT count(*) n FROM venues')?.n).toBe(1)
    expect(read<{ n: number }>('SELECT count(*) n FROM venue_emergency_info')?.n).toBe(1)
    expect(read<{ n: number }>(`SELECT count(*) n FROM shows WHERE status = 'PUBLISHED'`)?.n).toBe(1)
    expect(read<{ n: number }>('SELECT count(*) n FROM ticket_types')?.n).toBeGreaterThan(0)

    const performances = rows<{ starts_at: number }>('SELECT starts_at FROM performances ORDER BY starts_at')
    expect(performances).toHaveLength(2)

    const tonight = showNightBounds(seededNight)
    expect(performances[0]!.starts_at * 1000).toBeGreaterThanOrEqual(tonight.from.getTime())
    expect(performances[0]!.starts_at * 1000).toBeLessThan(tonight.to.getTime())
    expect(performances[1]!.starts_at * 1000).toBeGreaterThan(tonight.to.getTime())
  })

  // The venue points at the auditorium, and that attachment is all a room ever knows of a venue.
  test('the venue names a room, and no room names a venue (0043)', () => {
    const venue = read<{ room_id: string | null }>('SELECT room_id FROM venues')
    expect(venue?.room_id).not.toBeNull()
    expect(read<{ n: number }>('SELECT count(*) n FROM rooms WHERE id = ?', venue!.room_id)?.n).toBe(1)
    expect(rows<{ name: string }>(`SELECT name FROM pragma_table_info('rooms')`).map(column => column.name))
      .not.toContain('venue_id')
  })

  // Criterion 3: seeded people can never be mistaken for, or mailed to, a real person.
  test('every seeded person is obviously not a real one', () => {
    const names = rows<{ name: string, email: string }>(
      `SELECT name, email FROM users WHERE email LIKE '%@e2e.newtheatre.org.uk'`)

    expect(names.length).toBeGreaterThan(0)
    expect(names.filter(person => !person.name.includes('(test)'))).toEqual([])
    expect(seeded.every(person => person.email.endsWith('@e2e.newtheatre.org.uk'))).toBe(true)
  })

  test('running it again adds people rather than duplicating rooms', () => {
    const before = read<{ n: number }>('SELECT count(*) n FROM rooms')!.n
    const ran = Bun.spawnSync(['bun', 'scripts/seed.ts', app.databaseFile], { stdout: 'pipe', stderr: 'pipe' })

    expect(ran.exitCode).toBe(0)
    expect(read<{ n: number }>('SELECT count(*) n FROM rooms')?.n).toBe(before)
    // Tonight has to stay tonight, so a second run moves the performances rather than adding two.
    expect(read<{ n: number }>('SELECT count(*) n FROM venues')?.n).toBe(1)
    expect(read<{ n: number }>('SELECT count(*) n FROM performances')?.n).toBe(2)
  })
})
