import { describe, expect, test } from 'bun:test'
import { approveStatement, rejectStatement } from '#server/utils/approvals'
import { auditIfChanged } from '#server/utils/audit'
import { claimRoomSlotStatement, editPendingStatement, lapseStatement } from '#server/utils/bookings'
import { bumpStatements, seriesAuditStatement, seriesCancelStatements } from '#server/utils/room-writes'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { ClaimInput, EditInput } from '#server/utils/bookings'
import type { BumpWrite } from '#server/utils/room-writes'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// A room write's audit row rides the write's own batch, written only if the write applied (0049).
// Run here in batch order, so each audit reads the write just before it.

const NOW = 1_800_000_000
const HOUR = 3600
const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }
const SPAN = { startsAt: NOW + 48 * HOUR, endsAt: NOW + 50 * HOUR }
const OFFER = { roomId: 'r-green', room: 'Green Room', capacity: null, startsAt: NOW + 72 * HOUR, endsAt: NOW + 74 * HOUR }

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-member', 'member@example.invalid', 'A Member'],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-officer', 'officer@example.invalid', 'An Officer'],
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-studio', 'The Studio'],
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-green', 'Green Room'],
    ])
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, ...statements: SQL[]): void {
  for (const statement of statements) {
    const [query, ...parameters] = boundStatement(database, statement)
    database.raw.prepare(query).all(...parameters as never[])
  }
}

function booking(database: TestDatabase, id: string, status: string, over: { startsAt?: number, endsAt?: number, roomId?: string, seriesId?: string } = {}): void {
  database.batch([[`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, purpose, status, reason, created_at, series_id)
    VALUES (?, ?, 'u-member', 'Rehearsal', ?, ?, 'REHEARSAL', 'REHEARSAL', ?, 'Needed', ?, ?)`,
  id, over.roomId ?? 'r-studio', over.startsAt ?? SPAN.startsAt, over.endsAt ?? SPAN.endsAt, status, NOW - HOUR, over.seriesId ?? null]])
}

const statusOf = (database: TestDatabase, id: string): string | undefined =>
  rows<{ status: string }>(database, 'SELECT status FROM room_bookings WHERE id = ?', id)[0]?.status

const audits = (database: TestDatabase, action: string): { target: string, detail: Record<string, unknown> }[] =>
  rows<{ target: string, detail: string }>(database, 'SELECT target, detail FROM audit_log WHERE action = ? ORDER BY rowid', action)
    .map(row => ({ target: row.target, detail: JSON.parse(row.detail) as Record<string, unknown> }))

const entry = (action: string, target: string, detail: Record<string, unknown> = { room: 'r-studio' }) =>
  auditEntry({ actorId: 'u-officer', action, target, detail })

function claim(over: Partial<ClaimInput> = {}): ClaimInput {
  return {
    roomId: 'r-studio', userId: 'u-member', title: 'Rehearsal', attendees: null, tier: 'REHEARSAL', purpose: 'REHEARSAL',
    status: 'CONFIRMED', notes: null, offsets: OFFSETS, ...SPAN, ...over,
  }
}

describe('a booking or a request claimed is audited only if it landed', () => {
  test('the winning claim writes one audit row and the one beaten to the slot writes none', async () => {
    await withDatabase((database) => {
      run(database, claimRoomSlotStatement('b-first', claim()), auditIfChanged(entry('room.booked', 'booking:b-first')))
      run(database, claimRoomSlotStatement('b-second', claim()), auditIfChanged(entry('room.booked', 'booking:b-second')))
      expect(audits(database, 'room.booked').map(one => one.target)).toEqual(['booking:b-first'])
    })
  })
})

describe('an edit to a waiting request is audited only if it applied', () => {
  const edit = (over: Partial<EditInput> = {}): EditInput => ({
    id: 'b-asked', userId: 'u-member', roomId: 'r-green', title: 'Rehearsal', attendees: null, tier: 'REHEARSAL',
    purpose: 'REHEARSAL', notes: null, reason: 'Needed', restartClock: true, now: NOW, offsets: OFFSETS, ...SPAN, ...over,
  })

  test('an edit that lands is audited, and one to a request decided since is not', async () => {
    await withDatabase((database) => {
      booking(database, 'b-asked', 'PENDING_APPROVAL')
      run(database, editPendingStatement(edit()), auditIfChanged(entry('room.request.edited', 'booking:b-asked')))
      database.batch([['UPDATE room_bookings SET status = ? WHERE id = ?', 'CONFIRMED', 'b-asked']])
      run(database, editPendingStatement(edit({ roomId: 'r-studio' })), auditIfChanged(entry('room.request.edited', 'booking:b-asked')))
      expect(audits(database, 'room.request.edited')).toHaveLength(1)
    })
  })
})

describe('a decision is audited only if it applied', () => {
  test('two officers approving one request at once leave one audit row', async () => {
    await withDatabase((database) => {
      booking(database, 'b-asked', 'PENDING_APPROVAL')
      for (let officer = 0; officer < 2; officer++) {
        run(database, approveStatement('b-asked', 'u-officer', null, NOW, OFFSETS), auditIfChanged(entry('room.request.approved', 'booking:b-asked')))
      }
      expect(audits(database, 'room.request.approved')).toHaveLength(1)
    })
  })

  test('a rejection racing an approval that landed first writes no audit row', async () => {
    await withDatabase((database) => {
      booking(database, 'b-asked', 'PENDING_APPROVAL')
      run(database, approveStatement('b-asked', 'u-officer', null, NOW, OFFSETS), auditIfChanged(entry('room.request.approved', 'booking:b-asked')))
      run(database, rejectStatement('b-asked', 'u-officer', 'No room', NOW), auditIfChanged(entry('room.request.rejected', 'booking:b-asked')))
      expect(statusOf(database, 'b-asked')).toBe('CONFIRMED')
      expect(audits(database, 'room.request.rejected')).toEqual([])
    })
  })
})

describe('a bump is all or nothing, and audited with what it actually did', () => {
  const bump = (offer: BumpWrite['offer'] = OFFER): BumpWrite => ({
    displaced: { id: 'b-standing', roomId: 'r-studio', userId: 'u-member', title: 'Rehearsal', attendees: null, tier: 'REHEARSAL', purpose: 'REHEARSAL', ...SPAN },
    claimantId: 'u-officer', title: 'Dress run', tier: 'PRODUCTION', purpose: 'REHEARSAL', reason: 'Show week',
    offer, now: NOW, offsets: OFFSETS,
  })
  const bumped = () => entry('room.booking.bumped', 'booking:b-standing', { room: 'r-studio', tier: 'PRODUCTION', was: 'REHEARSAL' })

  test('the bump is audited once, naming the replacement and the offer held', async () => {
    await withDatabase((database) => {
      booking(database, 'b-standing', 'CONFIRMED')
      run(database, ...bumpStatements(bump(), 'b-claimant', 'b-offer', bumped()))
      const [written, ...more] = audits(database, 'room.booking.bumped')
      expect(more).toEqual([])
      expect(written!.detail).toMatchObject({ replacedBy: 'b-claimant', offered: 'b-offer', tier: 'PRODUCTION', was: 'REHEARSAL' })
    })
  })

  test('a second officer bumping the same booking writes no audit row, no booking and no offer', async () => {
    await withDatabase((database) => {
      booking(database, 'b-standing', 'CONFIRMED')
      run(database, ...bumpStatements(bump(), 'b-claimant', 'b-offer', bumped()))
      run(database, ...bumpStatements(bump(), 'b-claimant-2', 'b-offer-2', bumped()))
      expect(audits(database, 'room.booking.bumped')).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM room_bookings WHERE id IN (?, ?)', 'b-claimant-2', 'b-offer-2')).toEqual([])
    })
  })

  test('an offer that could not be held is audited as none, and nothing points at it', async () => {
    await withDatabase((database) => {
      booking(database, 'b-standing', 'CONFIRMED')
      booking(database, 'b-in-the-way', 'CONFIRMED', { roomId: 'r-green', startsAt: OFFER.startsAt, endsAt: OFFER.endsAt })
      run(database, ...bumpStatements(bump(), 'b-claimant', 'b-offer', bumped()))
      expect(audits(database, 'room.booking.bumped')[0]!.detail).toMatchObject({ replacedBy: 'b-claimant', offered: null })
      expect(statusOf(database, 'b-offer')).toBeUndefined()
      expect(rows<{ link: string | null }>(database, 'SELECT bumped_to_booking_id link FROM room_bookings WHERE id = ?', 'b-standing')[0]!.link).toBeNull()
    })
  })

  // The claimant's booking and the bump stand or fall together: never BUMPED with nobody in the slot.
  test('a claimant whose booking cannot be written bumps nobody and writes no audit row', async () => {
    await withDatabase((database) => {
      booking(database, 'b-standing', 'CONFIRMED')
      booking(database, 'b-overlapping', 'PENDING_APPROVAL', { startsAt: SPAN.startsAt + HOUR, endsAt: SPAN.endsAt + HOUR })
      run(database, ...bumpStatements(bump(), 'b-claimant', 'b-offer', bumped()))
      expect(statusOf(database, 'b-standing')).toBe('CONFIRMED')
      expect(statusOf(database, 'b-claimant')).toBeUndefined()
      expect(statusOf(database, 'b-offer')).toBeUndefined()
      expect(audits(database, 'room.booking.bumped')).toEqual([])
    })
  })
})

describe('a series is audited in its own batch', () => {
  test('the audit follows the series row', async () => {
    await withDatabase((database) => {
      run(database, seriesAuditStatement('s-absent', entry('room.series.booked', 'series:s-absent')))
      database.batch([[`INSERT INTO room_series (id, user_id, room_id, title, frequency, starts_on, clock_from, clock_to, occurrences)
        VALUES ('s-term', 'u-member', 'r-studio', 'Rehearsal', 'WEEKLY', '2027-01-04', '18:00', '20:00', 1)`]])
      run(database, seriesAuditStatement('s-term', entry('room.series.booked', 'series:s-term')))
      expect(audits(database, 'room.series.booked').map(one => one.target)).toEqual(['series:s-term'])
    })
  })
})

describe('a term cancelled is one audit row counting every week that went', () => {
  function term(database: TestDatabase): void {
    database.batch([[`INSERT INTO room_series (id, user_id, room_id, title, frequency, starts_on, clock_from, clock_to, occurrences)
      VALUES ('s-term', 'u-member', 'r-studio', 'Rehearsal', 'WEEKLY', '2027-01-04', '18:00', '20:00', 4)`]])
    booking(database, 'b-week-1', 'CONFIRMED', { seriesId: 's-term' })
    booking(database, 'b-week-2', 'PENDING_APPROVAL', { seriesId: 's-term', startsAt: SPAN.startsAt + 168 * HOUR, endsAt: SPAN.endsAt + 168 * HOUR })
    booking(database, 'b-week-3', 'REJECTED', { seriesId: 's-term', startsAt: SPAN.startsAt + 336 * HOUR, endsAt: SPAN.endsAt + 336 * HOUR })
    database.batch([[`INSERT INTO external_requests (id, user_id, title, purpose, starts_at, ends_at, status, series_id)
      VALUES ('x-week-4', 'u-member', 'Rehearsal', 'REHEARSAL', ?, ?, 'AWAITING_EXTERNAL', 's-term')`, SPAN.startsAt + 504 * HOUR, SPAN.endsAt + 504 * HOUR]])
  }
  const cancelled = () => auditEntry({ actorId: 'u-member', action: 'room.series.cancelled', target: 'series:s-term', detail: { room: 'r-studio', was: 'CONFIRMED' } })

  test('ours and theirs are counted together, a week already decided is not, and a second cancel writes nothing', async () => {
    await withDatabase((database) => {
      term(database)
      for (let attempt = 0; attempt < 2; attempt++) {
        const { audit, ours, theirs } = seriesCancelStatements('s-term', 'u-member', NOW, cancelled())
        run(database, audit, ours, theirs)
      }
      const [written, ...more] = audits(database, 'room.series.cancelled')
      expect(more).toEqual([])
      expect(written!.detail).toMatchObject({ room: 'r-studio', was: 'CONFIRMED', cancelled: 3 })
      expect(statusOf(database, 'b-week-3')).toBe('REJECTED')
    })
  })

  test('somebody else cancelling the term cancels and audits nothing', async () => {
    await withDatabase((database) => {
      term(database)
      const { audit, ours, theirs } = seriesCancelStatements('s-term', 'u-officer', NOW, cancelled())
      run(database, audit, ours, theirs)
      expect(statusOf(database, 'b-week-1')).toBe('CONFIRMED')
      expect(audits(database, 'room.series.cancelled')).toEqual([])
    })
  })
})

describe('the lapse sweep audits a lapse only if it lapsed', () => {
  test('a request swept twice is audited once', async () => {
    await withDatabase((database) => {
      booking(database, 'b-asked', 'PENDING_APPROVAL')
      for (let sweep = 0; sweep < 2; sweep++) {
        run(database, lapseStatement('b-asked', NOW - HOUR, NOW), auditIfChanged(auditEntry({ actorId: null, action: 'room.request.expired', target: 'booking:b-asked', detail: { room: 'The Studio' } })))
      }
      expect(audits(database, 'room.request.expired')).toHaveLength(1)
    })
  })
})
