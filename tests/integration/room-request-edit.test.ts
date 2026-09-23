import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { approveStatement } from '#server/utils/approvals'
import { editPendingStatement } from '#server/utils/bookings'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { EditInput } from '#server/utils/bookings'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// C-108 criterion 4 (issue 1055): a member edits a pending request through one guarded UPDATE,
// the owner, the status and the clash rule all on the statement (0003, 0006).

const HOUR = 3600
const NOW = 1_800_000_000
const CREATED = NOW - 30 * HOUR

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase, status = 'PENDING_APPROVAL'): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-asker', 'asker@example.invalid', 'An Asker'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-other', 'other@example.invalid', 'Somebody Else'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-officer', 'officer@example.invalid', 'An Officer'],
    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-studio', 'The Studio'],
    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-green', 'Green Room'],
    ['INSERT INTO rooms (id, name, is_active) VALUES (?, ?, 0)', 'r-annex', 'Annex'],
    [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, purpose, status, reason, created_at, escalated_at)
      VALUES ('b-asked', 'r-studio', 'u-asker', 'Dress run', ?, ?, 'GENERAL', 'REHEARSAL', ?, 'The get-in is that day.', ?, ?)`,
    NOW + 24 * HOUR, NOW + 26 * HOUR, status, CREATED, NOW - 6 * HOUR],
    [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, purpose, status)
      VALUES ('b-theirs', 'r-studio', 'u-other', 'Their rehearsal', ?, ?, 'GENERAL', 'REHEARSAL', 'CONFIRMED')`,
    NOW + 28 * HOUR, NOW + 30 * HOUR],
  ])
}

function edit(over: Partial<EditInput> = {}): EditInput {
  return {
    id: 'b-asked',
    userId: 'u-asker',
    roomId: 'r-studio',
    title: 'Dress run',
    attendees: 8,
    startsAt: NOW + 24 * HOUR,
    endsAt: NOW + 26 * HOUR,
    tier: 'GENERAL',
    purpose: 'REHEARSAL',
    notes: null,
    reason: 'The get-in is that day.',
    restartClock: false,
    now: NOW,
    ...over,
  }
}

// How many rows the statement wrote, read from its RETURNING the way the route reads it.
function run(database: TestDatabase, statement: SQL): number {
  const [text, ...parameters] = boundStatement(database, statement)
  return rows(database, text, ...parameters).length
}

interface Asked { room_id: string, status: string, starts_at: number, ends_at: number, attendees: number | null, created_at: number, escalated_at: number | null }

const asked = (database: TestDatabase): Asked =>
  rows<Asked>(database, `SELECT room_id, status, starts_at, ends_at, attendees, created_at, escalated_at
    FROM room_bookings WHERE id = 'b-asked'`)[0]!

describe('who may edit what (C-108 criterion 4)', () => {
  test('the owner edits a request waiting on a decision', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, editPendingStatement(edit()))).toBe(1)
      expect(asked(database).attendees).toBe(8)
      expect(asked(database).status).toBe('PENDING_APPROVAL')
    })
  })

  test('a confirmed booking is refused on the statement, not only before it', async () => {
    await withDatabase((database) => {
      seed(database, 'CONFIRMED')
      expect(run(database, editPendingStatement(edit()))).toBe(0)
      expect(asked(database).attendees).toBeNull()
    })
  })

  test('a cancelled or rejected request is refused the same way', async () => {
    for (const status of ['CANCELLED', 'REJECTED']) {
      await withDatabase((database) => {
        seed(database, status)
        expect(run(database, editPendingStatement(edit()))).toBe(0)
      })
    }
  })

  test('somebody else\'s request is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, editPendingStatement(edit({ userId: 'u-other' })))).toBe(0)
      expect(asked(database).attendees).toBeNull()
    })
  })

  test('a move into a retired room is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, editPendingStatement(edit({ roomId: 'r-annex' })))).toBe(0)
      expect(asked(database).room_id).toBe('r-studio')
    })
  })
})

describe('the clash rule rides the edit (C-107, C-108 criterion 4)', () => {
  test('a span somebody else holds is refused and the request stays as it was', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, editPendingStatement(edit({ startsAt: NOW + 27 * HOUR, endsAt: NOW + 29 * HOUR })))).toBe(0)
      expect(asked(database).starts_at).toBe(NOW + 24 * HOUR)
    })
  })

  // Moving within its own slot is not a clash with itself (the exceptId rule C-109 uses).
  test('a request is not in its own way', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, editPendingStatement(edit({ startsAt: NOW + 25 * HOUR, endsAt: NOW + 27 * HOUR })))).toBe(1)
      expect(asked(database).starts_at).toBe(NOW + 25 * HOUR)
    })
  })

  test('half-open: ending where the next booking starts is not a clash', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, editPendingStatement(edit({ startsAt: NOW + 26 * HOUR, endsAt: NOW + 28 * HOUR })))).toBe(1)
    })
  })

  test('the same span in another room is judged against that room', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, editPendingStatement(edit({ roomId: 'r-green', startsAt: NOW + 28 * HOUR, endsAt: NOW + 30 * HOUR })))).toBe(1)
      expect(asked(database).room_id).toBe('r-green')
    })
  })
})

// An in-process SQLite serialises, so this proves each order settles to one consistent outcome
// rather than that the two are atomic (0022): never an edit landing on a confirmed row.
describe('an edit racing an approval (C-109 criterion 3)', () => {
  test('approved first: the edit writes nothing and the booking stands as approved', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, approveStatement('b-asked', 'u-officer', null, NOW))).toBe(1)
      expect(run(database, editPendingStatement(edit({ startsAt: NOW + 20 * HOUR, endsAt: NOW + 22 * HOUR })))).toBe(0)
      expect(asked(database)).toMatchObject({ status: 'CONFIRMED', starts_at: NOW + 24 * HOUR })
    })
  })

  test('edited first: the approval confirms the span as edited', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(run(database, editPendingStatement(edit({ startsAt: NOW + 20 * HOUR, endsAt: NOW + 22 * HOUR })))).toBe(1)
      expect(run(database, approveStatement('b-asked', 'u-officer', null, NOW))).toBe(1)
      expect(asked(database)).toMatchObject({ status: 'CONFIRMED', starts_at: NOW + 20 * HOUR })
    })
  })

  test('an edit and a booking for one free span leave exactly one holder', async () => {
    await withDatabase((database) => {
      seed(database)
      const free = { startsAt: NOW + 40 * HOUR, endsAt: NOW + 42 * HOUR }
      const won = run(database, editPendingStatement(edit(free)))
      const claimed = run(database, sql`
        INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
        SELECT 'b-late', 'r-studio', 'u-other', 'Late', ${free.startsAt}, ${free.endsAt}, 'GENERAL', 'CONFIRMED'
        WHERE NOT EXISTS (
          SELECT 1 FROM room_bookings WHERE room_id = 'r-studio' AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
            AND starts_at < ${free.endsAt} AND ends_at > ${free.startsAt}
        )
        RETURNING id`)
      expect(won + claimed).toBe(1)
      expect(rows(database, `SELECT id FROM room_bookings WHERE room_id = 'r-studio' AND starts_at = ?`, free.startsAt)).toHaveLength(1)
    })
  })
})

describe('the escalation clock (issue 1055)', () => {
  test('an edit that keeps the room and the day leaves the clock running', async () => {
    await withDatabase((database) => {
      seed(database)
      run(database, editPendingStatement(edit({ restartClock: false })))
      expect(asked(database)).toMatchObject({ created_at: CREATED, escalated_at: NOW - 6 * HOUR })
    })
  })

  test('an edit that moves the room or the day starts it again, escalation included', async () => {
    await withDatabase((database) => {
      seed(database)
      run(database, editPendingStatement(edit({ roomId: 'r-green', restartClock: true })))
      expect(asked(database)).toMatchObject({ created_at: NOW, escalated_at: null })
    })
  })

  test('a refused edit restarts nothing', async () => {
    await withDatabase((database) => {
      seed(database, 'CONFIRMED')
      run(database, editPendingStatement(edit({ restartClock: true })))
      expect(asked(database)).toMatchObject({ created_at: CREATED, escalated_at: NOW - 6 * HOUR })
    })
  })
})
