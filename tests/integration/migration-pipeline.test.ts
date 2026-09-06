import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { buildLoad, loadedCounts, applyLoad } from '#migration/load'
import { createCore, transformIdentity } from '#migration/identity'
import { reconcile, transformBookings } from '#migration/bookings'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// migration/README.md's sequence, proved end to end: identity's core loads into a target with
// the real schema, and only then does the booking transform write into that same target.

function oldAuth(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, password TEXT,
      google_sub TEXT, pending_google_email TEXT, email_verified INTEGER, disabled INTEGER,
      session_epoch INTEGER, last_login INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE user_roles (
      user_id TEXT, role TEXT, expires_at INTEGER, granted_by TEXT, granted_at INTEGER,
      note TEXT, expiry_warned_at INTEGER);
    CREATE TABLE totp_secrets (
      user_id TEXT, secret TEXT, confirmed_at INTEGER, last_used_step INTEGER, created_at INTEGER);
    CREATE TABLE mfa_recovery_codes (user_id TEXT, code_hash TEXT, used_at INTEGER);

    INSERT INTO users (id, email, name, email_verified, disabled, session_epoch, created_at, updated_at)
    VALUES ('old-user-1', 'member@example.invalid', 'A Member (test)', 1, 0, 0, 1700000000, 1700000000);
  `)
  return db
}

const MARCH = Date.UTC(2024, 2, 4, 19)

function oldRooms(): Database {
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

    INSERT INTO bookings (id, user_id, room_id, external_venue_id, event_title, number_of_attendees,
      start_time, end_time, status, notes, rejection_reason, parent_booking_id, occurrence_number, created_at)
    VALUES (1, 'old-user-1', 1, NULL, 'Rehearsal', NULL, ${MARCH}, ${MARCH + 2 * 3_600_000}, 'CONFIRMED',
      NULL, NULL, NULL, NULL, ${MARCH - 86_400_000});
  `)
  return db
}

async function targetWithTheRealSchema(): Promise<TestDatabase> {
  const target = await createTestDatabase()
  target.batch([
    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'new-studio', 'The Studio'],
    ['INSERT INTO external_spaces (id, name, building) VALUES (?, ?, ?)', 'new-su', 'Portland C11', 'Portland Building'],
  ])
  return target
}

describe('the documented rehearsal sequence, identity then load then bookings, on one target', () => {
  test('bookings writes successfully once load has populated the same target with users', async () => {
    const auth = oldAuth()
    const rooms = oldRooms()
    const target = await targetWithTheRealSchema()

    try {
      // Step: transform-identity.ts, into its own core (schema-core.sql has no FK to anything
      // bookings needs, so this part of the pipeline was never broken).
      const core = await createCore(':memory:')
      const idMap = new Map<string, string>()
      transformIdentity({ auth, mirrors: [], roleMap: {}, idMap, target: core })

      // Step: load.ts, applied to the real target. This is what the fix requires running before
      // transform-bookings.ts: without it, room_bookings.user_id has nothing to reference.
      applyLoad(buildLoad(core), target.raw)
      expect(loadedCounts(target.raw).users).toBe(1)

      // Step: transform-bookings.ts, the same target. Before the fix this table did not exist
      // wherever the CLI actually wrote to; here it is the application's own real schema.
      const { summary } = transformBookings({
        source: rooms,
        accounts: idMap,
        rooms: new Map([['room:1', 'new-studio']]),
        spaces: new Map(),
        bookingIds: new Map(),
        seriesIds: new Map(),
        externalIds: new Map(),
        target: target.raw,
      })
      const check = reconcile(rooms, target.raw, summary)

      expect(summary.written).toBe(1)
      expect(check.ok).toBe(true)

      // The row itself references real, live ids, not ones invented for a staging file.
      const [booking] = rows<{ user_id: string, room_id: string }>(
        target, 'SELECT user_id, room_id FROM room_bookings',
      )
      expect(booking?.user_id).toBe([...idMap.values()][0])
      expect(booking?.room_id).toBe('new-studio')

      core.close()
    }
    finally {
      auth.close()
      rooms.close()
      target.close()
    }
  })

  test('the same target rejects a booking for a room that does not exist, exactly as production would', async () => {
    const auth = oldAuth()
    const rooms = oldRooms()
    const target = await targetWithTheRealSchema()

    try {
      const core = await createCore(':memory:')
      const idMap = new Map<string, string>()
      transformIdentity({ auth, mirrors: [], roleMap: {}, idMap, target: core })
      applyLoad(buildLoad(core), target.raw)

      // A room-map pointing at a room this target does not have: the real foreign key refuses it,
      // which is exactly why a hand-maintained schema subset without real rooms could never work.
      expect(() => transformBookings({
        source: rooms,
        accounts: idMap,
        rooms: new Map([['room:1', 'no-such-room']]),
        spaces: new Map(),
        bookingIds: new Map(),
        seriesIds: new Map(),
        externalIds: new Map(),
        target: target.raw,
      })).toThrow()

      core.close()
    }
    finally {
      auth.close()
      rooms.close()
      target.close()
    }
  })
})
