import { describe, expect, test } from 'bun:test'
import {
  incidentTrendsCountQuery,
  incidentTrendsQuery,
  performanceReportsCountQuery,
  performanceReportsQuery,
} from '#server/utils/season-reports'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-126's queries against the real migrations: a range never enumerates a season or a
// performance as an IN list, and every figure reads live from the operational tables (0001, 0003).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

function incident(database: TestDatabase, id: string, performanceId: string, reportedBy: string, category: string, severity: string): void {
  database.batch([['INSERT INTO incidents (id, performance_id, reported_by, category, severity, body) VALUES (?, ?, ?, ?, ?, ?)',
    id, performanceId, reportedBy, category, severity, 'Test entry']])
}

describe('incidentTrendsQuery groups by category, severity and venue within a range (criterion 1)', () => {
  test('a season boundary excludes what falls the wrong side of it', async () => {
    await withDatabase((database) => {
      const inside = tonightsPerformance(database, { suffix: 'inside' })
      const outside = tonightsPerformance(database, { suffix: 'outside', night: '2020-01-01' })
      const reporter = person(database, 'reporter')
      incident(database, 'i-1', inside.performanceId, reporter, 'SAFETY', 'INCIDENT')
      incident(database, 'i-2', inside.performanceId, reporter, 'SAFETY', 'INCIDENT')
      incident(database, 'i-3', outside.performanceId, reporter, 'SAFETY', 'INCIDENT')

      const from = inside.startsAt - 3600
      const to = inside.startsAt + 3600
      const found = run<{ category: string, severity: string, venueId: string, count: number }>(
        database, incidentTrendsQuery(from, to, {}, 50, 0),
      )
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ category: 'SAFETY', severity: 'INCIDENT', venueId: inside.venueId, count: 2 })
    })
  })

  test('groups separately by category, severity and venue, and a filter narrows the group', async () => {
    await withDatabase((database) => {
      const venueA = testVenue(database, { suffix: 'a' })
      const venueB = testVenue(database, { suffix: 'b' })
      const showA = tonightsPerformance(database, { suffix: 'venue-a', venueId: venueA.id })
      const showB = tonightsPerformance(database, { suffix: 'venue-b', venueId: venueB.id })
      const reporter = person(database, 'reporter-2')
      incident(database, 'i-4', showA.performanceId, reporter, 'SAFETY', 'NEAR_MISS')
      incident(database, 'i-5', showA.performanceId, reporter, 'BEHAVIOUR', 'NOTE')
      incident(database, 'i-6', showB.performanceId, reporter, 'SAFETY', 'NEAR_MISS')

      const from = Math.min(showA.startsAt, showB.startsAt) - 3600
      const to = Math.max(showA.startsAt, showB.startsAt) + 3600

      const all = run<{ count: number }>(database, incidentTrendsQuery(from, to, {}, 50, 0))
      expect(all).toHaveLength(3)

      const narrowed = run<{ venueId: string, count: number }>(
        database, incidentTrendsQuery(from, to, { category: 'SAFETY', severity: 'NEAR_MISS' }, 50, 0),
      )
      expect(narrowed.map(row => row.venueId).sort()).toEqual([venueA.id, venueB.id].sort())
      expect(narrowed.every(row => row.count === 1)).toBe(true)
    })
  })

  test('the count query answers the number of groups, not the number of incidents', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const reporter = person(database, 'reporter-3')
      incident(database, 'i-7', seeded.performanceId, reporter, 'SAFETY', 'INCIDENT')
      incident(database, 'i-8', seeded.performanceId, reporter, 'SAFETY', 'INCIDENT')
      incident(database, 'i-9', seeded.performanceId, reporter, 'OTHER', 'NOTE')

      const from = seeded.startsAt - 3600
      const to = seeded.startsAt + 3600
      const [found] = run<{ total: number }>(database, incidentTrendsCountQuery(from, to, {}))
      expect(found?.total).toBe(2)
    })
  })
})

describe('performanceReportsQuery reads attendance and staffing per performance (criterion 1)', () => {
  test('sold, admitted and no-shows read from the live reservation rows', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const booker = person(database, 'booker')
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'AAAAAA', seeded.performanceId, booker, 'DOOR', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-1', 'r-1', seeded.performanceId, 'tt-standard', 900, 'BASE'],
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-2', 'BBBBBB', seeded.performanceId, booker, 'NO_SHOW', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-2', 'r-2', seeded.performanceId, 'tt-standard', 900, 'BASE'],
      ])

      const from = seeded.startsAt - 3600
      const to = seeded.startsAt + 3600
      const [found] = run<{ sold: number, admitted: number, noShows: number }>(
        database, performanceReportsQuery(from, to, {}, 50, 0),
      )
      expect(found).toMatchObject({ sold: 1, admitted: 1, noShows: 1 })
    })
  })

  test('an unfilled slot is counted, a confirmed one is not', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const holder = person(database, 'holder')
      const decliner = person(database, 'decliner')
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)',
          'sh-1', seeded.performanceId, 'DOOR', 1, 'OPEN'],
        ['INSERT INTO shifts (id, performance_id, role, slot, status, user_id, decline_reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
          'sh-2', seeded.performanceId, 'BAR', 1, 'DECLINED', decliner, 'Unwell'],
        ['INSERT INTO shifts (id, performance_id, role, slot, status, user_id) VALUES (?, ?, ?, ?, ?, ?)',
          'sh-3', seeded.performanceId, 'DUTY_MANAGER', 1, 'CONFIRMED', holder],
      ])

      const from = seeded.startsAt - 3600
      const to = seeded.startsAt + 3600
      const [found] = run<{ unfilledSlots: number }>(database, performanceReportsQuery(from, to, {}, 50, 0))
      expect(found?.unfilledSlots).toBe(2)
    })
  })

  test('an officer bypass and an auto-closed report both read true', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const officer = person(database, 'officer')
      database.batch([
        ['INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
          'a-1', officer, 'night.officer-bypass', `night:${seeded.night}:${seeded.venueId}:DOOR`,
          JSON.stringify({ role: 'DOOR', night: seeded.night, venueId: seeded.venueId, performanceIds: [seeded.performanceId] })],
        ['INSERT INTO night_reports (id, performance_id, venue_id, night, closing_note, report, signed_by, signed_via) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'nr-1', seeded.performanceId, seeded.venueId, seeded.night, 'Closed automatically', '{}', null, 'SYSTEM'],
      ])

      const from = seeded.startsAt - 3600
      const to = seeded.startsAt + 3600
      const [found] = run<{ officerBypass: number, autoClosed: number }>(database, performanceReportsQuery(from, to, {}, 50, 0))
      expect(Boolean(found?.officerBypass)).toBe(true)
      expect(Boolean(found?.autoClosed)).toBe(true)
    })
  })

  test('a cancelled performance is excluded, and a venue filter narrows the rest', async () => {
    await withDatabase((database) => {
      const venueA = testVenue(database, { suffix: 'perf-a' })
      const venueB = testVenue(database, { suffix: 'perf-b' })
      const kept = tonightsPerformance(database, { suffix: 'kept', venueId: venueA.id })
      const cancelled = tonightsPerformance(database, { suffix: 'cancelled', venueId: venueA.id, curtainHoursAfterNightStart: 16, status: 'CANCELLED' })
      const elsewhere = tonightsPerformance(database, { suffix: 'elsewhere', venueId: venueB.id })

      const from = Math.min(kept.startsAt, cancelled.startsAt, elsewhere.startsAt) - 3600
      const to = Math.max(kept.startsAt, cancelled.startsAt, elsewhere.startsAt) + 3600

      const all = run<{ performanceId: string }>(database, performanceReportsQuery(from, to, {}, 50, 0))
      expect(all.map(row => row.performanceId).sort()).toEqual([kept.performanceId, elsewhere.performanceId].sort())

      const narrowed = run<{ performanceId: string }>(database, performanceReportsQuery(from, to, { venueId: venueA.id }, 50, 0))
      expect(narrowed.map(row => row.performanceId)).toEqual([kept.performanceId])

      const [count] = run<{ total: number }>(database, performanceReportsCountQuery(from, to, {}))
      expect(count?.total).toBe(2)
    })
  })
})
