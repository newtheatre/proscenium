import { describe, expect, test } from 'bun:test'
import {
  assignStatements, refuseAssignmentStatements, relistStatements, unlistStatements, withdrawStatements,
} from '#server/utils/external-writes'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { Assignment } from '#server/utils/external-writes'
import type { ClaimInput } from '#server/utils/bookings'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// A request for a room we do not manage is audited in its write's own batch, and whatever must land
// with the write lands only with its audit row (0049). Each batch here runs as one transaction.

const NOW = 1_800_000_000
const HOUR = 3600
const SPAN = { startsAt: NOW + 48 * HOUR, endsAt: NOW + 50 * HOUR }
const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-member', 'member@example.invalid', 'A Member'],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-officer', 'officer@example.invalid', 'An Officer'],
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-studio', 'The Studio'],
      ['INSERT INTO external_spaces (id, name) VALUES (?, ?)', 'sp-hall', 'Portland Hall'],
    ])
    await fn(database)
  }
  finally {
    database.close()
  }
}

// As a D1 batch is: a statement that raises undoes every one before it.
function batch(database: TestDatabase, statements: SQL[]): void {
  database.raw.transaction(() => {
    for (const statement of statements) {
      const [query, ...parameters] = boundStatement(database, statement)
      database.raw.prepare(query).all(...parameters as never[])
    }
  })()
}

function request(database: TestDatabase, id: string, status: string): void {
  database.batch([[`INSERT INTO external_requests (id, user_id, title, purpose, starts_at, ends_at, status)
    VALUES (?, 'u-member', 'Rehearsal', 'REHEARSAL', ?, ?, ?)`, id, SPAN.startsAt, SPAN.endsAt, status]])
}

function booking(database: TestDatabase, id: string, status: string): void {
  database.batch([[`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, purpose, status)
    VALUES (?, 'r-studio', 'u-member', 'Rehearsal', ?, ?, 'REHEARSAL', 'REHEARSAL', ?)`, id, SPAN.startsAt, SPAN.endsAt, status]])
}

const statusOf = (database: TestDatabase, table: 'external_requests' | 'room_bookings', id: string): string | undefined =>
  rows<{ status: string }>(database, `SELECT status FROM ${table} WHERE id = ?`, id)[0]?.status

const count = (database: TestDatabase, table: 'room_bookings' | 'external_requests' | 'external_assignments' | 'external_space_notes'): number =>
  rows<{ n: number }>(database, `SELECT count(*) n FROM ${table}`)[0]!.n

const audits = (database: TestDatabase, action: string): string[] =>
  rows<{ target: string }>(database, 'SELECT target FROM audit_log WHERE action = ? ORDER BY rowid', action).map(row => row.target)

const entry = (action: string, target: string, detail: Record<string, unknown> = {}) =>
  auditEntry({ actorId: 'u-officer', action, target, detail })

describe('relisting is one batch: the booking, the move and the audit land together or not at all', () => {
  const claim: ClaimInput = {
    roomId: 'r-studio', userId: 'u-member', title: 'Rehearsal', attendees: null, tier: 'REHEARSAL', purpose: 'REHEARSAL',
    status: 'CONFIRMED', notes: null, offsets: OFFSETS, ...SPAN,
  }
  const relist = (claimId: string) => relistStatements(
    { requestId: 'x-asked', claimId, claim, now: NOW },
    entry('external.request.relisted', 'external:x-asked', { became: claimId, room: 'r-studio' }),
  )

  test('a live request becomes a booking pointing both ways, audited once', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'AWAITING_EXTERNAL')
      batch(database, relist('b-became'))
      expect(statusOf(database, 'external_requests', 'x-asked')).toBe('CANCELLED')
      expect(rows(database, 'SELECT converted_to_booking_id AS link FROM external_requests WHERE id = ?', 'x-asked')).toEqual([{ link: 'b-became' }])
      expect(rows(database, 'SELECT converted_from_request_id AS link FROM room_bookings WHERE id = ?', 'b-became')).toEqual([{ link: 'x-asked' }])
      expect(audits(database, 'external.request.relisted')).toEqual(['external:x-asked'])
    })
  })

  test('relisting twice writes one booking and one audit row', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'REQUESTED')
      batch(database, relist('b-became'))
      batch(database, relist('b-again'))
      expect(statusOf(database, 'room_bookings', 'b-again')).toBeUndefined()
      expect(audits(database, 'external.request.relisted')).toHaveLength(1)
    })
  })

  // Nothing is claimed and then cancelled: the claim itself waits on the request still being live.
  test('a request that moved on first leaves no booking behind, cancelled or otherwise', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'REJECTED')
      batch(database, relist('b-became'))
      expect(count(database, 'room_bookings')).toBe(0)
      expect(statusOf(database, 'external_requests', 'x-asked')).toBe('REJECTED')
      expect(audits(database, 'external.request.relisted')).toEqual([])
    })
  })

  test('a slot taken first leaves the request as it was and writes no audit row', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'CONFIRMED')
      booking(database, 'b-first', 'CONFIRMED')
      batch(database, relist('b-became'))
      expect(statusOf(database, 'external_requests', 'x-asked')).toBe('CONFIRMED')
      expect(statusOf(database, 'room_bookings', 'b-became')).toBeUndefined()
      expect(audits(database, 'external.request.relisted')).toEqual([])
    })
  })
})

const assignment = (id: string, outcome: Assignment['outcome']): Assignment => ({
  id, requestId: 'x-asked', spaceId: 'sp-hall', outcome, reason: null, recordedBy: 'u-officer', recordedAt: NOW,
})

describe('an assignment is recorded only with the move it belongs to', () => {
  const assign = (id: string) => assignStatements(
    { status: 'CONFIRMED', assigned_space_id: 'sp-hall', decided_at: NOW, decided_by: 'u-officer', updated_at: NOW },
    assignment(id, 'ACCEPTED'),
    entry('external.request.assigned', 'external:x-asked', { space: 'sp-hall', overrode: false }),
  )

  test('an assignment that lands is audited once with its one assignment row', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'AWAITING_EXTERNAL')
      batch(database, assign('a-first'))
      expect(statusOf(database, 'external_requests', 'x-asked')).toBe('CONFIRMED')
      expect(count(database, 'external_assignments')).toBe(1)
      expect(audits(database, 'external.request.assigned')).toHaveLength(1)
    })
  })

  test('an assignment to a request withdrawn first records no room and no audit row', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'CANCELLED')
      batch(database, assign('a-first'))
      expect(count(database, 'external_assignments')).toBe(0)
      expect(audits(database, 'external.request.assigned')).toEqual([])
    })
  })
})

describe('a refused assignment records the refusal, the note and both audit rows only if the move applied', () => {
  const refuse = (id: string) => refuseAssignmentStatements(
    assignment(id, 'REFUSED'),
    entry('external.request.assignment.refused', 'external:x-asked', { space: 'sp-hall', noted: 'UNSUITABLE' }),
    {
      note: { id: `n-${id}`, spaceId: 'sp-hall', purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'No stage', writtenBy: 'u-officer', now: NOW },
      entry: entry('external.space.note.set', 'space:sp-hall', { space: 'sp-hall', purpose: 'REHEARSAL', verdict: 'UNSUITABLE' }),
    },
  )

  test('a refusal that lands writes all four, and the note replaces rather than adds', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'CONFIRMED')
      batch(database, refuse('a-first'))
      batch(database, refuse('a-second'))
      expect(statusOf(database, 'external_requests', 'x-asked')).toBe('AWAITING_EXTERNAL')
      expect(count(database, 'external_assignments')).toBe(2)
      expect(count(database, 'external_space_notes')).toBe(1)
      expect(audits(database, 'external.request.assignment.refused')).toHaveLength(2)
      expect(audits(database, 'external.space.note.set')).toHaveLength(2)
    })
  })

  test('a refusal against a request withdrawn first writes none of them', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'CANCELLED')
      batch(database, refuse('a-first'))
      expect(count(database, 'external_assignments')).toBe(0)
      expect(count(database, 'external_space_notes')).toBe(0)
      expect(audits(database, 'external.request.assignment.refused')).toEqual([])
      expect(audits(database, 'external.space.note.set')).toEqual([])
    })
  })

  test('a refusal with no note writes no note and no note audit row', async () => {
    await withDatabase((database) => {
      request(database, 'x-asked', 'CONFIRMED')
      batch(database, refuseAssignmentStatements(assignment('a-first', 'REFUSED'), entry('external.request.assignment.refused', 'external:x-asked'), null))
      expect(count(database, 'external_space_notes')).toBe(0)
      expect(audits(database, 'external.request.assignment.refused')).toHaveLength(1)
    })
  })
})

describe('the member withdrawing a request is audited once, whichever step it had reached', () => {
  const withdraw = () => withdrawStatements('x-asked', NOW, () => auditEntry({
    actorId: 'u-member', action: 'external.request.cancelled', target: 'external:x-asked', detail: { was: 'REQUESTED' },
  }))

  for (const status of ['REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED']) {
    test(`from ${status}: one audit row, and a second withdrawal writes none`, async () => {
      await withDatabase((database) => {
        request(database, 'x-asked', status)
        batch(database, withdraw())
        batch(database, withdraw())
        expect(statusOf(database, 'external_requests', 'x-asked')).toBe('CANCELLED')
        expect(audits(database, 'external.request.cancelled')).toHaveLength(1)
      })
    })
  }
})

describe('unlisting a request is audited in the batch that moves it', () => {
  const unlist = (requestId: string) => unlistStatements(
    { id: 'b-asked', userId: 'u-member', title: 'Rehearsal', purpose: 'REHEARSAL', attendees: null, notes: null, seriesId: null, occurrence: null, ...SPAN },
    requestId,
    NOW,
    entry('room.request.unlisted', 'booking:b-asked', { became: requestId, room: 'r-studio' }),
  )

  test('a waiting request moves and is audited once', async () => {
    await withDatabase((database) => {
      booking(database, 'b-asked', 'PENDING_APPROVAL')
      batch(database, unlist('x-became'))
      expect(statusOf(database, 'room_bookings', 'b-asked')).toBe('CANCELLED')
      expect(statusOf(database, 'external_requests', 'x-became')).toBe('REQUESTED')
      expect(audits(database, 'room.request.unlisted')).toEqual(['booking:b-asked'])
    })
  })

  test('a request decided first fails the whole batch, so there is no request and no audit row', async () => {
    await withDatabase((database) => {
      booking(database, 'b-asked', 'CONFIRMED')
      expect(() => batch(database, unlist('x-became'))).toThrow()
      expect(count(database, 'external_requests')).toBe(0)
      expect(audits(database, 'room.request.unlisted')).toEqual([])
    })
  })
})
