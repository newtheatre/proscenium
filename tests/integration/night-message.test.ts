import { describe, expect, test } from 'bun:test'
import { performanceTicketHoldersQuery } from '#server/utils/announcements'
import { nightAudienceQuery, performanceRotaQuery } from '#server/utils/night-message'
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
