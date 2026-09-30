import { describe, expect, test } from 'bun:test'
import { openingBypassesQuery } from '#server/utils/season-reports'
import { officerBypassEntry } from '#shared/utils/night-authority'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { NightRole } from '#shared/utils/night-authority'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Issue 1537 (E-130 criterion 6 as amended, 0111): a bypass at a venue with no performance has no
// night report, so the Night reports screen is where it surfaces, read from the rows themselves.

const NIGHT = '2026-10-17'

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

function bypass(database: TestDatabase, officer: string, night: string, venueId: string, role: NightRole, performanceIds: string[], openingId?: string): void {
  const entry = officerBypassEntry(officer, night, venueId, role, performanceIds, openingId)
  database.batch([['INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
    entry.id, entry.actorId, entry.action, entry.target, JSON.stringify(entry.detail)]])
}

function opening(database: TestDatabase, id: string, venueId: string, night: string, label: string, createdBy: string): string {
  database.batch([[`INSERT INTO bar_openings (id, venue_id, night, label, starts_at, ends_at, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'PLANNED', ?)`, id, venueId, night, label, 1_790_000_000, 1_790_010_000, createdBy]])
  return id
}

interface Found { night: string, role: string, venueId: string, venueName: string, openingLabel: string | null, officerName: string | null }

describe('officer bypasses with no performance (E-130 criterion 6, issue 1537)', () => {
  test('a till bypass on a bar opening is listed with its label, venue and officer', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database, { suffix: 'hire', name: 'The Studio' })
      const officer = person(database, 'officer')
      const openingId = opening(database, 'opening-social', venue.id, NIGHT, 'Society social', officer)
      bypass(database, officer, NIGHT, venue.id, 'BAR', [], openingId)

      expect(run<Found>(database, openingBypassesQuery(NIGHT, NIGHT, {}))).toEqual([
        { night: NIGHT, role: 'BAR', venueId: venue.id, venueName: 'The Studio', openingLabel: 'Society social', officerName: 'Someone officer' },
      ])
    })
  })

  test('a bar opened with no opening planned is still listed, naming no label', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database, { suffix: 'hire' })
      bypass(database, person(database, 'officer'), NIGHT, venue.id, 'BAR', [])

      const [found] = run<Found>(database, openingBypassesQuery(NIGHT, NIGHT, {}))
      expect(found).toMatchObject({ night: NIGHT, role: 'BAR', openingLabel: null, officerName: 'Someone officer' })
    })
  })

  test('a bypass on a performance is its night report\'s, not this list\'s', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      bypass(database, person(database, 'officer'), tonight.night, tonight.venueId, 'BAR', [tonight.performanceId])

      expect(run(database, openingBypassesQuery(tonight.night, tonight.night, {}))).toEqual([])
    })
  })

  test('the period is inclusive of both days, by the show night the row names', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database, { suffix: 'hire' })
      const officer = person(database, 'officer')
      bypass(database, officer, '2026-10-16', venue.id, 'BAR', [])
      bypass(database, officer, '2026-10-17', venue.id, 'BAR', [])
      bypass(database, officer, '2026-10-18', venue.id, 'BAR', [])
      bypass(database, officer, '2026-10-19', venue.id, 'BAR', [])

      const found = run<Found>(database, openingBypassesQuery('2026-10-17', '2026-10-18', {}))
      expect(found.map(row => row.night)).toEqual(['2026-10-17', '2026-10-18'])
    })
  })

  test('a venue filter narrows the list', async () => {
    await withDatabase((database) => {
      const here = testVenue(database, { suffix: 'here' })
      const there = testVenue(database, { suffix: 'there' })
      const officer = person(database, 'officer')
      bypass(database, officer, NIGHT, here.id, 'BAR', [])
      bypass(database, officer, NIGHT, there.id, 'BAR', [])

      const found = run<Found>(database, openingBypassesQuery(NIGHT, NIGHT, { venueId: here.id }))
      expect(found.map(row => row.venueId)).toEqual([here.id])
    })
  })

  test('binds a fixed number of parameters whatever the period holds (0006)', async () => {
    await withDatabase((database) => {
      const [, ...parameters] = boundStatement(database, openingBypassesQuery('2025-08-01', '2026-07-31', { venueId: 'venue-a' }))
      expect(parameters.length).toBeLessThanOrEqual(6)
    })
  })
})
