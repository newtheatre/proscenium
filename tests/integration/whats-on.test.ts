import { describe, expect, test } from 'bun:test'
import {
  countListedShowsQuery,
  listedPerformancesQuery,
  listedPricesQuery,
  listedShowScope,
  listedShowsQuery,
  oneShowScope,
} from '#server/utils/whats-on'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-101 on the real migrations. What the states mean is in tests/unit/whats-on.test.ts; this is
// what the queries do and do not return.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

const NOW = 1_780_000_000

function addTicketType(database: TestDatabase, id: string, name: string, price: number, over: Record<string, unknown> = {}): void {
  database.batch([[
    'INSERT INTO ticket_types (id, name, price, kind, access_kind, archived, active_by_default, restricted_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, name, price, over.kind ?? 'SINGLE', over.accessKind ?? null, over.archived ?? 0, over.activeByDefault ?? 1, over.restrictedTo ?? null,
  ]])
}

describe('only a published show with something still to sell is listed (D-101 criterion 1)', () => {
  test('a published show with a future on-sale performance is listed', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const listed = read<{ slug: string }>(database, listedShowsQuery(seeded.startsAt - 3600, 25, 0))
      expect(listed.map(show => show.slug)).toEqual(['a-test-show-a'])
    })
  })

  test('a draft show is not listed, whatever its performances say', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { showStatus: 'DRAFT' })
      expect(read<{ slug: string }>(database, listedShowsQuery(seeded.startsAt - 3600, 25, 0))).toEqual([])
    })
  })

  test('a published show whose only performance is off sale is not listed', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { status: 'DRAFT' })
      expect(read<{ slug: string }>(database, listedShowsQuery(seeded.startsAt - 3600, 25, 0))).toEqual([])
    })
  })

  // A show still running is not on offer, and a show that has finished its run drops off with
  // nothing to sweep.
  test('a show whose performances have all begun is not listed', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      expect(read<{ slug: string }>(database, listedShowsQuery(seeded.startsAt + 1, 25, 0))).toEqual([])
    })
  })

  test('the count answers the same question the page does', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      tonightsPerformance(database, { suffix: 'b', showStatus: 'DRAFT' })
      const [counted] = read<{ total: number }>(database, countListedShowsQuery(seeded.startsAt - 3600))
      expect(counted?.total).toBe(1)
    })
  })

  test('shows come out in the order their next performance runs', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { suffix: 'a', curtainHoursAfterNightStart: 20 })
      tonightsPerformance(database, { suffix: 'b', curtainHoursAfterNightStart: 16 })
      const listed = read<{ slug: string }>(database, listedShowsQuery(first.startsAt - 40 * 3600, 25, 0))
      expect(listed.map(show => show.slug)).toEqual(['a-test-show-b', 'a-test-show-a'])
    })
  })
})

describe('the listed performances are the ones a visitor may be shown', () => {
  test('a cancelled performance is shown so a ticket holder is told, and a draft one is not', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
          'performance-cancelled', seeded.showId, seeded.venueId, seeded.startsAt + 86_400, 'CANCELLED'],
        ['INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
          'performance-draft', seeded.showId, seeded.venueId, seeded.startsAt + 172_800, 'DRAFT'],
      ])

      const at = seeded.startsAt - 3600
      const found = read<{ id: string }>(database, listedPerformancesQuery(listedShowScope(at, 25, 0), at))
      expect(found.map(one => one.id)).toEqual(['performance-a', 'performance-cancelled'])
    })
  })

  test('a performance carries both levels of the window, so nothing reads the show back', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { bookingClosesHoursBefore: 3 })
      database.batch([['UPDATE shows SET booking_closes_hours_before = ? WHERE id = ?', 2, seeded.showId]])

      const at = seeded.startsAt - 4 * 3600
      const [found] = read<{ bookingClosesHoursBefore: number, showBookingClosesHoursBefore: number }>(
        database, listedPerformancesQuery(listedShowScope(at, 25, 0), at),
      )
      expect(found?.bookingClosesHoursBefore).toBe(3)
      expect(found?.showBookingClosesHoursBefore).toBe(2)
    })
  })

  test('capacity resolves the performance override then the venue, and null stays uncapped', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 40 })
      const uncapped = testVenue(database, { suffix: 'b', capacity: null })
      tonightsPerformance(database, { suffix: 'b', venueId: uncapped.id })

      const at = seeded.startsAt - 3600
      const found = read<{ id: string, capacity: number | null }>(
        database, listedPerformancesQuery(listedShowScope(at, 25, 0), at),
      )
      expect(found.find(one => one.id === 'performance-a')?.capacity).toBe(40)
      expect(found.find(one => one.id === 'performance-b')?.capacity).toBeNull()
    })
  })
})

// Criterion 3: no internal note, no cost data and no access or companion type may appear.
describe('the public payload is column allow-listed (D-101 criterion 3)', () => {
  test('the performance query returns no internal notes column', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([['UPDATE performances SET notes = ? WHERE id = ?', 'Tech is fragile', seeded.performanceId]])

      const at = seeded.startsAt - 3600
      const [found] = read<Record<string, unknown>>(database, listedPerformancesQuery(listedShowScope(at, 25, 0), at))
      expect(Object.keys(found ?? {})).not.toContain('notes')
      expect(JSON.stringify(found)).not.toContain('Tech is fragile')
    })
  })

  test('an access or companion type never reaches a price row', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addTicketType(database, 'tt-standard', 'Standard', 900)
      addTicketType(database, 'tt-access', 'Wheelchair space', 900, { accessKind: 'ACCESS' })
      addTicketType(database, 'tt-companion', 'Companion', 0, { accessKind: 'COMPANION' })
      addTicketType(database, 'tt-old', 'Withdrawn', 500, { archived: 1 })
      addTicketType(database, 'tt-pass', 'Pass admission', 0, { kind: 'PASS_ADMISSION' })

      const at = seeded.startsAt - 3600
      const prices = read<{ name: string }>(database, listedPricesQuery(listedShowScope(at, 25, 0), at))
      expect(prices.map(price => price.name)).toEqual(['Standard'])
    })
  })

  // A-129 criterion 5: the show page needs to know which price is member-only to say so.
  test('a member-restricted price carries its restriction to the public row', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addTicketType(database, 'tt-standard', 'Standard', 900)
      addTicketType(database, 'tt-member', 'Member', 500, { restrictedTo: 'MEMBER' })

      const at = seeded.startsAt - 3600
      const prices = read<{ name: string, restrictedTo: string | null }>(
        database, listedPricesQuery(listedShowScope(at, 25, 0), at),
      )
      expect(prices.find(price => price.name === 'Standard')?.restrictedTo).toBeNull()
      expect(prices.find(price => price.name === 'Member')?.restrictedTo).toBe('MEMBER')
    })
  })

  test('an override at either level is carried for resolution, base price included', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addTicketType(database, 'tt-standard', 'Standard', 900)
      database.batch([
        ['INSERT INTO show_ticket_overrides (id, show_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
          'so-1', seeded.showId, 'tt-standard', 700],
        ['INSERT INTO performance_ticket_overrides (id, performance_id, ticket_type_id, price, active) VALUES (?, ?, ?, ?, ?)',
          'po-1', seeded.performanceId, 'tt-standard', 500, 1],
      ])

      const at = seeded.startsAt - 3600
      const [price] = read<{ basePrice: number, showPrice: number, performancePrice: number, performanceActive: number }>(
        database, listedPricesQuery(listedShowScope(at, 25, 0), at),
      )
      expect(price?.basePrice).toBe(900)
      expect(price?.showPrice).toBe(700)
      expect(price?.performancePrice).toBe(500)
      expect(price?.performanceActive).toBe(1)
    })
  })
})

// The listing pages over shows, and the three queries behind it scope by subquery rather than by
// an id list read back from the first result set (0003, 0006).
describe('nothing binds a parameter per row', () => {
  const at = NOW

  test('every listing query binds a fixed handful, however many shows there are', async () => {
    await withDatabase((database) => {
      for (const statement of [
        listedShowsQuery(at, 25, 0),
        countListedShowsQuery(at),
        listedPerformancesQuery(listedShowScope(at, 25, 0), at),
        listedPricesQuery(listedShowScope(at, 25, 0), at),
      ]) {
        const [query, ...parameters] = boundStatement(database, statement)
        expect(`${query.slice(0, 20)}: ${parameters.length <= MAX_BOUND_PARAMETERS}`).toBe(`${query.slice(0, 20)}: true`)
        expect(parameters.length).toBeLessThanOrEqual(8)
      }
    })
  })

  test('a show page binds its address and the moment, and nothing else', async () => {
    await withDatabase((database) => {
      const [, ...parameters] = boundStatement(database, listedPerformancesQuery(oneShowScope('the-seagull'), at))
      expect(parameters).toEqual(['the-seagull', at])
    })
  })

  test('the listing scope is a subquery, never an id list', async () => {
    await withDatabase((database) => {
      const [query] = boundStatement(database, listedPerformancesQuery(listedShowScope(at, 25, 0), at))
      expect(query).toContain('IN (SELECT id FROM (')
    })
  })
})

describe('a show page answers for one published show only (D-101 criterion 1)', () => {
  test('a draft show\'s address resolves to no performances at all', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { showStatus: 'DRAFT' })
      const at = seeded.startsAt - 3600
      expect(read(database, listedPerformancesQuery(oneShowScope('a-test-show-a'), at))).toEqual([])
    })
  })

  test('one address never reaches another show\'s performances', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      tonightsPerformance(database, { suffix: 'b' })
      const at = seeded.startsAt - 3600
      const found = read<{ id: string }>(database, listedPerformancesQuery(oneShowScope('a-test-show-a'), at))
      expect(found.map(one => one.id)).toEqual(['performance-a'])
    })
  })
})

// J-111 criterion 6: what's on filters by venue, and the count answers the same question the
// page does, or the pager offers a page that is not there.
describe('the listing narrows to one venue by name (J-111)', () => {
  test('only the shows with a performance in that venue are listed', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { suffix: 'a', venueName: 'The Main Hall' })
      tonightsPerformance(database, { suffix: 'b', venueName: 'The Studio' })
      const at = first.startsAt - 3600

      const listed = read<{ slug: string }>(database, listedShowsQuery(at, 25, 0, 'The Studio'))
      expect(listed.map(show => show.slug)).toEqual(['a-test-show-b'])
    })
  })

  test('the count narrows with the page', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { suffix: 'a', venueName: 'The Main Hall' })
      tonightsPerformance(database, { suffix: 'b', venueName: 'The Studio' })
      const at = first.startsAt - 3600

      const [counted] = read<{ total: number }>(database, countListedShowsQuery(at, 'The Studio'))
      expect(counted?.total).toBe(1)
    })
  })

  test('a venue nobody holds lists nothing, rather than everything', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { suffix: 'a', venueName: 'The Main Hall' })
      expect(read(database, listedShowsQuery(seeded.startsAt - 3600, 25, 0, 'The Attic'))).toEqual([])
    })
  })

  test('no venue is every venue, which is what the unfiltered page is', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { suffix: 'a', venueName: 'The Main Hall' })
      tonightsPerformance(database, { suffix: 'b', venueName: 'The Studio' })
      const at = first.startsAt - 3600
      expect(read<{ slug: string }>(database, listedShowsQuery(at, 25, 0, null)).length).toBe(2)
    })
  })

  // A show on in two venues is one row under either name, never two under one.
  test('a show with a performance in each venue is listed once under either', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { suffix: 'a', venueName: 'The Main Hall' })
      testVenue(database, { suffix: 'studio', name: 'The Studio' })
      database.batch([[
        `INSERT INTO performances (id, show_id, venue_id, starts_at, doors_at, duration_minutes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        'performance-a2', 'show-a', 'venue-studio', seeded.startsAt + 86_400, null, 120, 'ON_SALE',
      ]])
      const at = seeded.startsAt - 3600

      expect(read<{ slug: string }>(database, listedShowsQuery(at, 25, 0, 'The Studio')).map(show => show.slug))
        .toEqual(['a-test-show-a'])
      expect(read<{ slug: string }>(database, listedShowsQuery(at, 25, 0, 'The Main Hall')).map(show => show.slug))
        .toEqual(['a-test-show-a'])
    })
  })
})
