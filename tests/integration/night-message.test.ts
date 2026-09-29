import { describe, expect, test } from 'bun:test'
import { performanceTicketHoldersQuery } from '#server/utils/announcements'
import { TAKEN_OVER, draftClaimsQuery, nightAudienceQuery, performanceRotaQuery, takeOverInterruptedQuery } from '#server/utils/night-message'
import { nightMessageClaim } from '#shared/utils/night-message'
import { showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Tonight's audience for one performance (0101, issue 1327) against the real migrations: its rota,
// and its ticket holders through the same resolver the announce composer uses (0089).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function ids(database: TestDatabase, statement: SQL): string[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, query, ...parameters).map(row => row.id).sort()
}

let seq = 0

function person(database: TestDatabase, anonymisedAt: number | null = null): string {
  const id = `u-nm-${++seq}`
  database.batch([['INSERT INTO users (id, name, email, verified, anonymised_at) VALUES (?, ?, ?, 1, ?)',
    id, `Person ${id}`, `${id}@e2e.newtheatre.org.uk`, anonymisedAt]])
  return id
}

function shift(database: TestDatabase, performanceId: string, role: string, userId: string | null, status: string): void {
  database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
    `s-nm-${++seq}`, performanceId, role, seq, userId, status]])
}

describe('tonight\'s rota for one performance (0101)', () => {
  test('a confirmed or claimed slot is in; an open or declined one reaches nobody', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database)
      const confirmed = person(database)
      const claimed = person(database)
      shift(database, performanceId, 'DUTY_MANAGER', confirmed, 'CONFIRMED')
      shift(database, performanceId, 'DOOR', claimed, 'CLAIMED')
      shift(database, performanceId, 'BAR', null, 'OPEN')
      shift(database, performanceId, 'BAR', person(database), 'DECLINED')

      expect(ids(database, performanceRotaQuery(performanceId))).toEqual([claimed, confirmed].sort())
    })
  })

  test('somebody on two slots is one recipient, and an anonymised account is never reached', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database)
      const twice = person(database)
      shift(database, performanceId, 'DOOR', twice, 'CONFIRMED')
      shift(database, performanceId, 'BAR', twice, 'CONFIRMED')
      shift(database, performanceId, 'DOOR', person(database, 1_700_000_000), 'CONFIRMED')

      expect(ids(database, performanceRotaQuery(performanceId))).toEqual([twice])
    })
  })

  // A matinee's team is not the evening's: the duty manager messages the house they chose.
  test('another performance\'s rota, at the same venue tonight, is not reached', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      const matinee = tonightsPerformance(database, { suffix: 'nm-matinee', venueId: venue.id, curtainHoursAfterNightStart: 10 })
      const evening = tonightsPerformance(database, { suffix: 'nm-evening', venueId: venue.id, curtainHoursAfterNightStart: 15.5 })
      const matineeDoor = person(database)
      shift(database, matinee.performanceId, 'DOOR', matineeDoor, 'CONFIRMED')
      shift(database, evening.performanceId, 'DOOR', person(database), 'CONFIRMED')

      expect(ids(database, performanceRotaQuery(matinee.performanceId))).toEqual([matineeDoor])
    })
  })
})

describe('nightAudienceQuery picks the audience the duty manager chose (0101)', () => {
  test('ticket holders are the announce composer\'s own resolver for that performance', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const { performanceId, night } = tonightsPerformance(database)
      const holder = person(database)
      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-nm-1', 'NMREF1', performanceId, holder, 'COLLECTED', 'WEB'],
        [`INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source)
          VALUES (?, ?, ?, ?, ?, ?)`, 't-nm-1', 'r-nm-1', performanceId, 'tt-standard', 900, 'BASE'],
      ])
      const from = Math.floor(showNightBounds(night).from.getTime() / 1000)

      expect(ids(database, nightAudienceQuery('TICKET_HOLDERS', performanceId, from))).toEqual([holder])
      expect(ids(database, nightAudienceQuery('TICKET_HOLDERS', performanceId, from)))
        .toEqual(ids(database, performanceTicketHoldersQuery(performanceId, from)))
    })
  })

  test('the rota is that performance\'s rota', async () => {
    await withDatabase((database) => {
      const { performanceId, night } = tonightsPerformance(database)
      const door = person(database)
      shift(database, performanceId, 'DOOR', door, 'CONFIRMED')
      const from = Math.floor(showNightBounds(night).from.getTime() / 1000)

      expect(ids(database, nightAudienceQuery('ROTA', performanceId, from))).toEqual([door])
    })
  })
})

// 0108: a retry of the same draft by the same sender takes over its own claims still PENDING
// after 30 seconds, in one conditional statement, and nobody else's.
describe('a retry takes over its own interrupted claims, and nothing else (0108)', () => {
  const DRAFT = '0b6c1f4e-6f1a-4f0e-9d5e-2f8a7c3b1d90'
  const OTHER_DRAFT = '9f1d2c3b-4a5e-4f60-8e7d-1a2b3c4d5e6f'
  const NOW = 1_790_000_000

  function claimRow(database: TestDatabase, claim: string, status: string, ageSeconds: number, userId: string): string {
    const id = `nl-nm-${++seq}`
    database.batch([['INSERT INTO notification_log (id, user_id, type, channel, status, record_id, claim, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, userId, 'admin.ticket-holders.safety-notice', 'EMAIL', status, 'performance-a', claim, NOW - ageSeconds]])
    return id
  }

  function takeOver(database: TestDatabase, draftKey = DRAFT, senderId = 'sender-1'): string[] {
    const [query, ...parameters] = boundStatement(database, takeOverInterruptedQuery(draftKey, senderId, NOW))
    return rows<{ userId: string }>(database, query, ...parameters).map(row => row.userId).sort()
  }

  function row(database: TestDatabase, id: string): { status: string, error: string | null, claim: string, created_at: number } {
    return rows<{ status: string, error: string | null, claim: string, created_at: number }>(database, 'SELECT status, error, claim, created_at FROM notification_log WHERE id = ?', id)[0]!
  }

  // What the send's loop does next: claimNotification's own insert, refused while the key is held.
  function claimAgain(database: TestDatabase, claim: string, userId: string): boolean {
    return rows(database, `INSERT INTO notification_log (id, user_id, type, channel, status, claim) VALUES (?, ?, 'admin.ticket-holders.safety-notice', 'EMAIL', 'PENDING', ?)
      ON CONFLICT DO NOTHING RETURNING id`, `nl-again-${++seq}`, userId, claim).length === 1
  }

  test('a PENDING claim older than 30 seconds is taken over, and the loop can claim that person again', async () => {
    await withDatabase((database) => {
      const recipient = person(database)
      const claim = nightMessageClaim(DRAFT, 'sender-1', recipient)
      const stuck = claimRow(database, claim, 'PENDING', 31, recipient)

      expect(takeOver(database)).toEqual([recipient])
      expect(row(database, stuck)).toMatchObject({ status: 'FAILED_FINAL', error: TAKEN_OVER, claim: `interrupted:${claim}:${stuck}`, created_at: NOW - 31 })
      expect(claimAgain(database, claim, recipient)).toBe(true)
    })
  })

  test('a PENDING claim younger than 30 seconds is left alone, still being sent', async () => {
    await withDatabase((database) => {
      const recipient = person(database)
      const claim = nightMessageClaim(DRAFT, 'sender-1', recipient)
      const young = claimRow(database, claim, 'PENDING', 29, recipient)

      expect(takeOver(database)).toEqual([])
      expect(row(database, young)).toMatchObject({ status: 'PENDING', claim })
      expect(claimAgain(database, claim, recipient)).toBe(false)
    })
  })

  test('a copy already SENT is never taken over or resent, however old', async () => {
    await withDatabase((database) => {
      const recipient = person(database)
      const claim = nightMessageClaim(DRAFT, 'sender-1', recipient)
      const sent = claimRow(database, claim, 'SENT', 3600, recipient)

      expect(takeOver(database)).toEqual([])
      expect(row(database, sent)).toMatchObject({ status: 'SENT', claim })
      expect(claimAgain(database, claim, recipient)).toBe(false)
    })
  })

  test('another sender\'s claim and another draft\'s claim are never touched', async () => {
    await withDatabase((database) => {
      const recipient = person(database)
      const theirs = claimRow(database, nightMessageClaim(DRAFT, 'sender-2', recipient), 'PENDING', 3600, recipient)
      const otherDraft = claimRow(database, nightMessageClaim(OTHER_DRAFT, 'sender-1', recipient), 'PENDING', 3600, recipient)

      expect(takeOver(database)).toEqual([])
      expect(row(database, theirs).status).toBe('PENDING')
      expect(row(database, otherDraft).status).toBe('PENDING')
    })
  })

  // Two retries racing: the status is on the predicate, so only the first statement takes the row.
  test('a claim is taken over once, however many retries run the takeover', async () => {
    await withDatabase((database) => {
      const recipient = person(database)
      claimRow(database, nightMessageClaim(DRAFT, 'sender-1', recipient), 'PENDING', 60, recipient)

      expect(takeOver(database)).toEqual([recipient])
      expect(takeOver(database)).toEqual([])
    })
  })

  test('after the takeover the draft counts what is already out and what is still being sent', async () => {
    await withDatabase((database) => {
      const [sent, stuck, young] = [person(database), person(database), person(database)]
      claimRow(database, nightMessageClaim(DRAFT, 'sender-1', sent), 'SENT', 120, sent)
      claimRow(database, nightMessageClaim(DRAFT, 'sender-1', stuck), 'PENDING', 120, stuck)
      claimRow(database, nightMessageClaim(DRAFT, 'sender-1', young), 'PENDING', 5, young)
      claimRow(database, nightMessageClaim(DRAFT, 'sender-2', sent), 'SENT', 120, sent)

      takeOver(database)
      const [query, ...parameters] = boundStatement(database, draftClaimsQuery(DRAFT, 'sender-1'))
      expect(rows(database, query, ...parameters)[0]).toEqual({ alreadyOut: 1, stillSending: 1 })
    })
  })
})
