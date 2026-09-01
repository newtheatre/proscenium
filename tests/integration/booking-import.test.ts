import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { STATUS_MAP, reconcile, transformBookings } from '#migration/bookings'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// C-118, proved against a source shaped like the real old rooms schema and the real migrations
// this repo builds. The rehearsal against a production dump is the other half and cannot run here.

// The tables the transform reads, and nothing else. Milliseconds and integer ids, as the old app
// had them: reading either the wrong way lands the whole history in 1970.
function oldEstate(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY, user_id TEXT, room_id INTEGER, external_venue_id INTEGER,
      event_title TEXT NOT NULL, number_of_attendees INTEGER,
      start_time INTEGER NOT NULL, end_time INTEGER NOT NULL,
      status TEXT NOT NULL, notes TEXT, rejection_reason TEXT,
      parent_booking_id INTEGER, occurrence_number INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE recurring_patterns (
      id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL, frequency TEXT NOT NULL,
      interval INTEGER NOT NULL DEFAULT 1, days_of_week TEXT,
      max_occurrences INTEGER NOT NULL, end_date INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, user_id TEXT, endpoint TEXT);
  `)
  return db
}

const MARCH = Date.UTC(2024, 2, 4, 19)

interface Placed { id: number, over?: Record<string, unknown> }

function place(db: Database, { id, over = {} }: Placed): void {
  const row = {
    user_id: 'old-user-1',
    room_id: 1,
    external_venue_id: null,
    event_title: 'Rehearsal',
    number_of_attendees: null,
    start_time: MARCH,
    end_time: MARCH + 2 * 3_600_000,
    status: 'CONFIRMED',
    notes: null,
    rejection_reason: null,
    parent_booking_id: null,
    occurrence_number: null,
    created_at: MARCH - 86_400_000,
    ...over,
  }
  db.query(`
    INSERT INTO bookings (id, user_id, room_id, external_venue_id, event_title, number_of_attendees,
      start_time, end_time, status, notes, rejection_reason, parent_booking_id, occurrence_number, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, row.user_id as string, row.room_id as number, row.external_venue_id,
    row.event_title as string, row.number_of_attendees, row.start_time as number, row.end_time as number,
    row.status as string, row.notes, row.rejection_reason, row.parent_booking_id, row.occurrence_number,
    row.created_at as number)
}

async function targetWithEstate(): Promise<TestDatabase> {
  const target = await createTestDatabase()
  target.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'new-user-1', 'a@example.invalid', 'A Member'],
    ['INSERT INTO users (id, email, name, verified, anonymised_at) VALUES (?, ?, ?, 1, ?)',
      'new-ghost', 'deleted-x@anonymised.invalid', 'Deleted user', 1_700_000_000],
    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'new-studio', 'The Studio'],
    ['INSERT INTO external_spaces (id, name, building) VALUES (?, ?, ?)', 'new-su', 'Portland C11', 'Portland Building'],
  ])
  return target
}

function run(source: Database, target: TestDatabase, accounts = new Map([['old-user-1', 'new-user-1']])): ReturnType<typeof transformBookings> {
  return transformBookings({
    source,
    accounts,
    rooms: new Map([['room:1', 'new-studio']]),
    spaces: new Map([['venue:7', 'new-su']]),
    bookingIds: new Map(),
    seriesIds: new Map(),
    externalIds: new Map(),
    target: (target as unknown as { raw: Database }).raw ?? (target as unknown as Database),
  })
}

describe('the old history imports keyed to the canonical account (criterion 1)', () => {
  test('a booking lands with its original times and status', async () => {
    const source = oldEstate()
    place(source, { id: 1 })
    const target = await targetWithEstate()

    try {
      const { summary } = run(source, target)
      expect(summary.written).toBe(1)

      const [booking] = rows<{ user_id: string, starts_at: number, ends_at: number, status: string, title: string }>(
        target, 'SELECT user_id, starts_at, ends_at, status, title FROM room_bookings')

      expect(booking?.user_id).toBe('new-user-1')
      expect(booking?.title).toBe('Rehearsal')
      expect(booking?.status).toBe('CONFIRMED')
      // Seconds here, milliseconds there.
      expect(booking?.starts_at).toBe(Math.floor(MARCH / 1000))
      expect(booking?.ends_at).toBe(Math.floor(MARCH / 1000) + 7200)
    }
    finally {
      target.close()
    }
  })

  test.each(Object.entries(STATUS_MAP))('%s imports as %s', async (oldStatus, newStatus) => {
    const source = oldEstate()
    place(source, { id: 1, over: { status: oldStatus } })
    const target = await targetWithEstate()

    try {
      run(source, target)
      expect(rows<{ status: string }>(target, 'SELECT status FROM room_bookings')[0]?.status).toBe(newStatus)
    }
    finally {
      target.close()
    }
  })

  // A booking at a union venue was never a booking of ours: it is a request (C-120, 0036).
  test('a booking of a union venue becomes a request, not a booking', async () => {
    const source = oldEstate()
    place(source, { id: 1, over: { room_id: null, external_venue_id: 7 } })
    const target = await targetWithEstate()

    try {
      const { summary } = run(source, target)
      expect(summary.externalWritten).toBe(1)
      expect(summary.written).toBe(0)
      expect(rows(target, 'SELECT id FROM room_bookings')).toHaveLength(0)
      expect(rows(target, 'SELECT id FROM external_requests')).toHaveLength(1)
    }
    finally {
      target.close()
    }
  })

  // The venue a row names meant different things depending on where it had got to.
  test('AWAITING_EXTERNAL survives, and its venue is what we asked for', async () => {
    const source = oldEstate()
    place(source, { id: 1, over: { room_id: null, external_venue_id: 7, status: 'AWAITING_EXTERNAL' } })
    const target = await targetWithEstate()

    try {
      run(source, target)
      const [request] = rows<{ status: string, preferred_space_id: string | null, assigned_space_id: string | null }>(
        target, 'SELECT status, preferred_space_id, assigned_space_id FROM external_requests')

      expect(request?.status).toBe('AWAITING_EXTERNAL')
      expect(request?.preferred_space_id).toBe('new-su')
      expect(request?.assigned_space_id).toBeNull()
    }
    finally {
      target.close()
    }
  })

  test('a confirmed one carries its venue as the room we were given', async () => {
    const source = oldEstate()
    place(source, { id: 1, over: { room_id: null, external_venue_id: 7, status: 'CONFIRMED' } })
    const target = await targetWithEstate()

    try {
      run(source, target)
      const [request] = rows<{ status: string, preferred_space_id: string | null, assigned_space_id: string | null }>(
        target, 'SELECT status, preferred_space_id, assigned_space_id FROM external_requests')

      expect(request?.status).toBe('CONFIRMED')
      expect(request?.assigned_space_id).toBe('new-su')
      expect(request?.preferred_space_id).toBeNull()
    }
    finally {
      target.close()
    }
  })

  // The purpose is never invented: nobody was ever asked.
  test('an imported request records no purpose', async () => {
    const source = oldEstate()
    place(source, { id: 1, over: { room_id: null, external_venue_id: 7 } })
    const target = await targetWithEstate()

    try {
      run(source, target)
      expect(rows<{ purpose: string }>(target, 'SELECT purpose FROM external_requests')[0]?.purpose)
        .toBe('UNRECORDED')
    }
    finally {
      target.close()
    }
  })

  test('a series keeps its shape: a head, a pattern and numbered occurrences', async () => {
    const source = oldEstate()
    place(source, { id: 1 })
    source.query(`INSERT INTO recurring_patterns (id, booking_id, frequency, interval, days_of_week, max_occurrences, created_at)
                  VALUES (1, 1, 'WEEKLY', 1, '[1]', 3, ?)`).run(MARCH)
    place(source, { id: 2, over: { parent_booking_id: 1, occurrence_number: 2, start_time: MARCH + 7 * 86_400_000, end_time: MARCH + 7 * 86_400_000 + 7_200_000 } })
    place(source, { id: 3, over: { parent_booking_id: 1, occurrence_number: 3, start_time: MARCH + 14 * 86_400_000, end_time: MARCH + 14 * 86_400_000 + 7_200_000 } })

    const target = await targetWithEstate()
    try {
      const { summary } = run(source, target)
      expect(summary.series).toBe(1)
      expect(summary.written).toBe(3)

      const series = rows<{ id: string, frequency: string, occurrences: number }>(
        target, 'SELECT id, frequency, occurrences FROM room_series')
      expect(series).toHaveLength(1)
      expect(series[0]?.frequency).toBe('WEEKLY')

      const occurrences = rows<{ series_id: string, occurrence: number | null }>(
        target, 'SELECT series_id, occurrence FROM room_bookings ORDER BY starts_at')
      expect(occurrences.every(one => one.series_id === series[0]!.id)).toBe(true)
      // The head carries no occurrence number in the old app; the ones after it do.
      expect(occurrences.map(one => one.occurrence)).toEqual([null, 2, 3] as (number | null)[])
    }
    finally {
      target.close()
    }
  })

  // The old app allowed a recurrence the new one does not, so the pattern goes and the bookings
  // stay: losing a term of history to keep a descriptor would be the wrong trade.
  test('a custom recurrence drops its pattern and keeps its bookings', async () => {
    const source = oldEstate()
    place(source, { id: 1 })
    source.query(`INSERT INTO recurring_patterns (id, booking_id, frequency, interval, days_of_week, max_occurrences, created_at)
                  VALUES (1, 1, 'CUSTOM', 1, NULL, 2, ?)`).run(MARCH)
    place(source, { id: 2, over: { parent_booking_id: 1, occurrence_number: 2 } })

    const target = await targetWithEstate()
    try {
      const { summary, exceptions } = run(source, target)
      expect(summary.droppedPatterns).toBe(1)
      expect(summary.written).toBe(2)
      expect(rows(target, 'SELECT id FROM room_series')).toHaveLength(0)
      expect(exceptions.some(one => one.includes('CUSTOM'))).toBe(true)
    }
    finally {
      target.close()
    }
  })
})

describe('nothing is invented (criterion 3)', () => {
  test('a booking whose account never came across is skipped, not given one', async () => {
    const source = oldEstate()
    place(source, { id: 1, over: { user_id: 'old-user-missing' } })
    const target = await targetWithEstate()

    try {
      const { summary, exceptions } = run(source, target)
      expect(summary.written).toBe(0)
      expect(summary.skippedNoAccount).toBe(1)
      expect(rows(target, 'SELECT id FROM room_bookings')).toHaveLength(0)
      expect(exceptions[0]).toContain('no canonical account')
    }
    finally {
      target.close()
    }
  })

  test('a tombstone keeps its bookings and stays a tombstone', async () => {
    const source = oldEstate()
    place(source, { id: 1, over: { user_id: 'old-ghost' } })
    const target = await targetWithEstate()

    try {
      run(source, target, new Map([['old-ghost', 'new-ghost']]))

      expect(rows<{ user_id: string }>(target, 'SELECT user_id FROM room_bookings')[0]?.user_id).toBe('new-ghost')
      // Untouched: the import writes bookings, never accounts.
      const [ghost] = rows<{ name: string, anonymised_at: number }>(
        target, `SELECT name, anonymised_at FROM users WHERE id = 'new-ghost'`)
      expect(ghost?.name).toBe('Deleted user')
      expect(ghost?.anonymised_at).toBe(1_700_000_000)
    }
    finally {
      target.close()
    }
  })

  test('a booking of a room that no longer exists is skipped and named', async () => {
    const source = oldEstate()
    place(source, { id: 1, over: { room_id: 99 } })
    const target = await targetWithEstate()

    try {
      const { summary, exceptions } = run(source, target)
      expect(summary.skippedNoRoom).toBe(1)
      expect(exceptions[0]).toContain('no room')
    }
    finally {
      target.close()
    }
  })

  // Push consent is re-collected when push actually works, so it is deliberately not read.
  test('web push subscriptions are not migrated', async () => {
    const source = oldEstate()
    source.query('INSERT INTO push_subscriptions (id, user_id, endpoint) VALUES (1, ?, ?)')
      .run('old-user-1', 'https://push.example.invalid/x')
    place(source, { id: 1 })

    const target = await targetWithEstate()
    try {
      run(source, target)
      const tables = rows<{ name: string }>(target, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      expect(tables.some(one => one.name.includes('push'))).toBe(false)
    }
    finally {
      target.close()
    }
  })
})

describe('it reconciles, and fails loudly (criterion 2)', () => {
  test('a clean import reconciles', async () => {
    const source = oldEstate()
    place(source, { id: 1 })
    place(source, { id: 2, over: { start_time: MARCH + 86_400_000, end_time: MARCH + 86_400_000 + 3_600_000 } })

    const target = await targetWithEstate()
    try {
      const { summary } = run(source, target)
      const raw = (target as unknown as { raw: Database }).raw ?? (target as unknown as Database)
      const check = reconcile(source, raw, summary)
      expect(check.problems).toEqual([])
      expect(check.ok).toBe(true)
    }
    finally {
      target.close()
    }
  })

  // The failure a row count never catches: milliseconds read as seconds puts the history in 1970
  // and every booking becomes a thousand times too long.
  test('booked hours are checksummed, not just counted', async () => {
    const source = oldEstate()
    place(source, { id: 1 })
    const target = await targetWithEstate()

    try {
      const { summary } = run(source, target)
      const raw = (target as unknown as { raw: Database }).raw ?? (target as unknown as Database)

      raw.query('UPDATE room_bookings SET ends_at = ends_at + 3600').run()
      const check = reconcile(source, raw, summary)

      expect(check.ok).toBe(false)
      expect(check.problems[0]).toContain('booked seconds differ')
    }
    finally {
      target.close()
    }
  })

  test('a count that does not add up is a problem, not a rounding', async () => {
    const source = oldEstate()
    place(source, { id: 1 })
    const target = await targetWithEstate()

    try {
      const { summary } = run(source, target)
      const raw = (target as unknown as { raw: Database }).raw ?? (target as unknown as Database)
      const check = reconcile(source, raw, { ...summary, read: summary.read + 5 })

      expect(check.ok).toBe(false)
      expect(check.problems[0]).toContain('accounted for')
    }
    finally {
      target.close()
    }
  })
})

describe('a rehearsal runs again without doubling the history (criterion 5)', () => {
  test('the same export imported twice leaves one of each booking', async () => {
    const source = oldEstate()
    place(source, { id: 1 })
    place(source, { id: 2, over: { start_time: MARCH + 86_400_000, end_time: MARCH + 86_400_000 + 3_600_000 } })

    const target = await targetWithEstate()
    try {
      // The maps are the artefact a rehearsal carries forward, so the second run reuses the ids
      // the first minted rather than making new ones.
      const bookingIds = new Map<string, string>()
      const seriesIds = new Map<string, string>()
      const externalIds = new Map<string, string>()
      const raw = (target as unknown as { raw: Database }).raw ?? (target as unknown as Database)
      const accounts = new Map([['old-user-1', 'new-user-1']])
      const rooms = new Map([['room:1', 'new-studio']])
      const spaces = new Map([['venue:7', 'new-su']])
      const carried = { source, accounts, rooms, spaces, seriesIds, externalIds, target: raw }

      transformBookings({ ...carried, bookingIds })
      const first = rows<{ id: string }>(target, 'SELECT id FROM room_bookings ORDER BY starts_at').map(one => one.id)

      transformBookings({ ...carried, bookingIds })
      const second = rows<{ id: string }>(target, 'SELECT id FROM room_bookings ORDER BY starts_at').map(one => one.id)

      expect(second).toHaveLength(2)
      expect(second).toEqual(first)
    }
    finally {
      target.close()
    }
  })

  test('an id map from a previous rehearsal is honoured', async () => {
    const source = oldEstate()
    place(source, { id: 1 })
    const target = await targetWithEstate()

    try {
      const bookingIds = new Map([['1', 'chosenidfromlastweek00000000000000']])
      const raw = (target as unknown as { raw: Database }).raw ?? (target as unknown as Database)
      transformBookings({
        source,
        accounts: new Map([['old-user-1', 'new-user-1']]),
        rooms: new Map([['room:1', 'new-studio']]),
        spaces: new Map(),
        bookingIds,
        seriesIds: new Map(),
        externalIds: new Map(),
        target: raw,
      })

      expect(rows<{ id: string }>(target, 'SELECT id FROM room_bookings')[0]?.id)
        .toBe('chosenidfromlastweek00000000000000')
    }
    finally {
      target.close()
    }
  })
})
