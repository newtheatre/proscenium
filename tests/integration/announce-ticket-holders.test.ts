import { describe, expect, test } from 'bun:test'
import { announceShowsQuery, audienceQuery, performanceTicketHoldersQuery, showTicketHoldersQuery } from '#server/utils/announcements'
import { showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { BoundStatement, TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Ticket holders for a performance or a show (H-108 criteria 8 and 9, 0089), resolved against
// the real migrations from live reservations.

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

function nightOpensAt(night: string): number {
  return Math.floor(showNightBounds(night).from.getTime() / 1000)
}

function booker(database: TestDatabase, over: { verified?: boolean, anonymisedAt?: number } = {}): string {
  const id = `u-th-${++seq}`
  database.batch([['INSERT INTO users (id, name, email, verified, anonymised_at) VALUES (?, ?, ?, ?, ?)',
    id, `Booker ${id}`, `${id}@e2e.newtheatre.org.uk`, over.verified === false ? 0 : 1, over.anonymisedAt ?? null]])
  return id
}

function booking(database: TestDatabase, performanceId: string, userId: string | null, status: string, refunded: boolean[] = [false]): string {
  const id = `r-th-${++seq}`
  const tickets: BoundStatement[] = refunded.map((isRefunded, index) => [
    `INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source, refunded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    `${id}-t${index}`, id, performanceId, 'tt-standard', 900, 'BASE', isRefunded ? 1_700_000_000 : null,
  ])
  database.batch([
    ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
      id, `REF${seq}`, performanceId, userId, status, 'WEB'],
    ...tickets,
  ])
  return id
}

// Another performance of the same show, the given number of nights later.
function laterPerformance(database: TestDatabase, from: { showId: string, venueId: string, startsAt: number }, id: string, nights = 1): string {
  database.batch([[
    'INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
    id, from.showId, from.venueId, from.startsAt + nights * 86_400, 'ON_SALE',
  ]])
  return id
}

describe('ticket holders for a performance (criterion 8)', () => {
  test('held, collected and admitted bookings are in; cancelled, expired and no-show are not', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database)
      const pending = booker(database)
      const collected = booker(database)
      const door = booker(database)
      booking(database, tonight.performanceId, pending, 'PENDING')
      booking(database, tonight.performanceId, collected, 'COLLECTED')
      booking(database, tonight.performanceId, door, 'DOOR')
      booking(database, tonight.performanceId, booker(database), 'CANCELLED')
      booking(database, tonight.performanceId, booker(database), 'EXPIRED')
      booking(database, tonight.performanceId, booker(database), 'NO_SHOW')

      expect(ids(database, performanceTicketHoldersQuery(tonight.performanceId, nightOpensAt(tonight.night)))).toEqual([pending, collected, door].sort())
    })
  })

  test('a wholly refunded booking is out; one with a ticket still unrefunded is in', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database)
      const partlyRefunded = booker(database)
      booking(database, tonight.performanceId, booker(database), 'COLLECTED', [true, true])
      booking(database, tonight.performanceId, partlyRefunded, 'COLLECTED', [true, false])

      expect(ids(database, performanceTicketHoldersQuery(tonight.performanceId, nightOpensAt(tonight.night)))).toEqual([partlyRefunded])
    })
  })

  test('a guest who never verified is reached; an anonymised booker and a booking with nobody behind it are not', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database)
      const guest = booker(database, { verified: false })
      booking(database, tonight.performanceId, guest, 'PENDING')
      booking(database, tonight.performanceId, booker(database, { anonymisedAt: 1_700_000_000 }), 'COLLECTED')
      booking(database, tonight.performanceId, null, 'COLLECTED')

      expect(ids(database, performanceTicketHoldersQuery(tonight.performanceId, nightOpensAt(tonight.night)))).toEqual([guest])
    })
  })

  test('two bookings by one person are one recipient, and another performance\'s holders are not reached', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database)
      const later = laterPerformance(database, tonight, 'performance-later')
      const twice = booker(database)
      booking(database, tonight.performanceId, twice, 'COLLECTED')
      booking(database, tonight.performanceId, twice, 'PENDING')
      booking(database, later, booker(database), 'COLLECTED')

      expect(ids(database, performanceTicketHoldersQuery(tonight.performanceId, nightOpensAt(tonight.night)))).toEqual([twice])
    })
  })

  test('a cancelled performance still resolves its holders, since they are the ones who need telling', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database, { status: 'CANCELLED' })
      const holder = booker(database)
      booking(database, tonight.performanceId, holder, 'COLLECTED')

      expect(ids(database, performanceTicketHoldersQuery(tonight.performanceId, nightOpensAt(tonight.night)))).toEqual([holder])
    })
  })
})

// 0089: an imported booking is COLLECTED with a booker, so only the night keeps a past
// production's audience, years of it, from being one message away.
describe('only a performance still to come has an audience (criterion 8)', () => {
  test('last night\'s bookers are not reached for that performance, nor for the show', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database)
      const lastNight = laterPerformance(database, tonight, 'performance-last-night', -1)
      const coming = booker(database)
      const been = booker(database)
      booking(database, tonight.performanceId, coming, 'COLLECTED')
      booking(database, lastNight, been, 'COLLECTED')
      const from = nightOpensAt(tonight.night)

      expect(ids(database, performanceTicketHoldersQuery(lastNight, from))).toEqual([])
      expect(ids(database, showTicketHoldersQuery(tonight.showId, from))).toEqual([coming])
    })
  })

  test('a show whose run is over has nobody to reach', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database)
      const lastNight = laterPerformance(database, tonight, 'performance-last-night', -1)
      booking(database, lastNight, booker(database), 'COLLECTED')
      database.batch([['DELETE FROM performances WHERE id = ?', tonight.performanceId]])

      expect(ids(database, showTicketHoldersQuery(tonight.showId, nightOpensAt(tonight.night)))).toEqual([])
    })
  })

  test('a performance earlier tonight still counts, since the night runs from 04:00', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database, { curtainHoursAfterNightStart: 0.5 })
      const holder = booker(database)
      booking(database, tonight.performanceId, holder, 'COLLECTED')

      expect(ids(database, performanceTicketHoldersQuery(tonight.performanceId, nightOpensAt(tonight.night)))).toEqual([holder])
    })
  })
})

describe('ticket holders for a show (criterion 8)', () => {
  test('every performance of the run is covered, a booker across two nights is one recipient, and another show is not', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database)
      const later = laterPerformance(database, tonight, 'performance-later')
      const elsewhere = tonightsPerformance(database, { suffix: 'b' })
      const firstNight = booker(database)
      const secondNight = booker(database)
      const both = booker(database)
      booking(database, tonight.performanceId, firstNight, 'COLLECTED')
      booking(database, later, secondNight, 'PENDING')
      booking(database, tonight.performanceId, both, 'COLLECTED')
      booking(database, later, both, 'COLLECTED')
      booking(database, elsewhere.performanceId, booker(database), 'COLLECTED')

      expect(ids(database, showTicketHoldersQuery(tonight.showId, nightOpensAt(tonight.night)))).toEqual([firstNight, secondNight, both].sort())
    })
  })

  // 0006: the run is scoped by subquery, so the statement binds the show and the night and
  // nothing read back from a result set, however many performances the run has.
  test('the statement binds two parameters whatever the length of the run', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      for (let night = 1; night <= 120; night++) laterPerformance(database, tonight, `performance-run-${night}`, night)

      const [, ...parameters] = boundStatement(database, showTicketHoldersQuery(tonight.showId, nightOpensAt(tonight.night)))
      expect(parameters).toEqual([tonight.showId, nightOpensAt(tonight.night)])
      const [, ...performanceParameters] = boundStatement(database, performanceTicketHoldersQuery(tonight.performanceId, nightOpensAt(tonight.night)))
      expect(performanceParameters).toEqual([tonight.performanceId, nightOpensAt(tonight.night)])
    })
  })

  test('the composer\'s audience definition resolves through the same queries', async () => {
    await withDatabase((database) => {
      ticketTypeFixture(database)
      const tonight = tonightsPerformance(database)
      const holder = booker(database)
      booking(database, tonight.performanceId, holder, 'COLLECTED')
      const context = { today: '2026-01-01', graceDays: 14, nowEpoch: 1_700_000_000, night: tonight.night }

      expect(ids(database, audienceQuery({ kind: 'PERFORMANCE_TICKET_HOLDERS', performanceId: tonight.performanceId }, context))).toEqual([holder])
      expect(ids(database, audienceQuery({ kind: 'SHOW_TICKET_HOLDERS', showId: tonight.showId }, context))).toEqual([holder])
    })
  })
})

describe('the announce composer\'s show picker', () => {
  test('a draft show and a show whose run is over are not offered, and past nights are not listed', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      laterPerformance(database, tonight, 'performance-last-night', -1)
      const draft = tonightsPerformance(database, { suffix: 'draft', showStatus: 'DRAFT' })
      const over = tonightsPerformance(database, { suffix: 'over' })
      database.batch([['UPDATE performances SET starts_at = ? WHERE id = ?', over.startsAt - 86_400, over.performanceId]])

      const [query, ...parameters] = boundStatement(database, announceShowsQuery('test show', nightOpensAt(tonight.night)))
      const found = rows<{ showId: string, performanceId: string }>(database, query, ...parameters)
      expect(found.map(row => row.performanceId)).toEqual([tonight.performanceId])
      expect(found.map(row => row.showId)).not.toContain(draft.showId)
    })
  })

  test('finds a show by its title with every performance, a cancelled one included, and not by an unrelated term', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      laterPerformance(database, tonight, 'performance-later')
      database.batch([['UPDATE performances SET status = ? WHERE id = ?', 'CANCELLED', 'performance-later']])

      const [query, ...parameters] = boundStatement(database, announceShowsQuery('test show', nightOpensAt(tonight.night)))
      const found = rows<{ showId: string, performanceId: string }>(database, query, ...parameters)
      expect(found.map(row => row.showId)).toEqual([tonight.showId, tonight.showId])
      expect(found.map(row => row.performanceId).sort()).toEqual([tonight.performanceId, 'performance-later'].sort())

      const [none, ...noParameters] = boundStatement(database, announceShowsQuery('rigging', nightOpensAt(tonight.night)))
      expect(rows(database, none, ...noParameters)).toEqual([])
    })
  })
})
