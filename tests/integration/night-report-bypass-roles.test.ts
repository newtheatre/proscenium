import { describe, expect, test } from 'bun:test'
import { reportOfficerBypassesQuery, reportStaffingQuery } from '#server/utils/night-report'
import { officerBypassEntry } from '#shared/utils/night-authority'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { NightRole } from '#shared/utils/night-authority'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Issue 1537 (E-123 criterion 1 as amended, 0111): one officer role holds all three bypasses, so
// the report flags each by the role it stood in for, whatever the rota stamped.

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

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

// Written by the guard's own entry builder, so the report reads exactly the row an act records.
function bypass(database: TestDatabase, officer: string, night: string, venueId: string, role: NightRole, performanceIds: string[], openingId?: string): void {
  const entry = officerBypassEntry(officer, night, venueId, role, performanceIds, openingId)
  database.batch([['INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
    entry.id, entry.actorId, entry.action, entry.target, JSON.stringify(entry.detail)]])
}

interface Found { role: string, officerName: string | null, confirmedShift: number }

describe('every bypass is flagged by the role it stood in for (E-123 criterion 1, issue 1537)', () => {
  test('a performance with no shifts stamped still carries its bypass', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      bypass(database, person(database, 'officer'), tonight.night, tonight.venueId, 'DUTY_MANAGER', [tonight.performanceId])

      expect(read(database, reportStaffingQuery(tonight.performanceId))).toEqual([])
      expect(read<Found>(database, reportOfficerBypassesQuery(tonight.performanceId, tonight.venueId, tonight.night)))
        .toEqual([{ role: 'DUTY_MANAGER', officerName: 'Someone officer', confirmedShift: 0 }])
    })
  })

  test('opening the till is flagged as the bar, not the duty manager', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      bypass(database, person(database, 'officer'), tonight.night, tonight.venueId, 'BAR', [tonight.performanceId])

      const found = read<Found>(database, reportOfficerBypassesQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found.map(row => row.role)).toEqual(['BAR'])
    })
  })

  test('admitting at the door is flagged as the door, not the duty manager', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      bypass(database, person(database, 'officer'), tonight.night, tonight.venueId, 'DOOR', [tonight.performanceId])

      const found = read<Found>(database, reportOfficerBypassesQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found.map(row => row.role)).toEqual(['DOOR'])
    })
  })

  test('one officer standing in for all three is three flags, one per role', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const officer = person(database, 'officer')
      for (const role of ['BAR', 'DOOR', 'DUTY_MANAGER'] as const) {
        bypass(database, officer, tonight.night, tonight.venueId, role, [tonight.performanceId])
      }

      const found = read<Found>(database, reportOfficerBypassesQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found.map(row => row.role)).toEqual(['DUTY_MANAGER', 'DOOR', 'BAR'])
    })
  })

  test('a bar opened at another venue with nothing on is not this performance\'s report', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const hire = testVenue(database, { suffix: 'hire' })
      bypass(database, person(database, 'officer'), tonight.night, hire.id, 'BAR', [])

      expect(read(database, reportOfficerBypassesQuery(tonight.performanceId, tonight.venueId, tonight.night))).toEqual([])
    })
  })
})
