import { describe, expect, test } from 'bun:test'
import { reportOfficerBypassesQuery, reportStaffingQuery } from '#server/utils/night-report'
import { performancesWithConfirmedRoleQuery } from '#server/utils/rota'
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
function bypass(database: TestDatabase, officer: string, night: string, venueId: string, role: NightRole, performanceIds: string[], openingId?: string, confirmed?: string[]): void {
  const entry = officerBypassEntry(officer, night, venueId, role, performanceIds, openingId, confirmed)
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

function shift(database: TestDatabase, performanceId: string, role: NightRole, userId: string, status = 'CONFIRMED'): string {
  const id = `${performanceId}-${role}-${userId}`
  database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
    id, performanceId, role, 1, userId, status]])
  return id
}

// The 21 October process map: the report printed the rota as it stood at sign-off, the reverse of
// the truth when the officer acted (0231).
describe('the staffing line says what the rota held when the officer acted (0231)', () => {
  test('a bar shift confirmed when the officer used the till stays "beside", after it is unconfirmed', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const shiftId = shift(database, tonight.performanceId, 'BAR', person(database, 'amy'))
      const confirmed = read<{ performanceId: string }>(database, performancesWithConfirmedRoleQuery('BAR', tonight.venueId, tonight.night))
      bypass(database, person(database, 'officer'), tonight.night, tonight.venueId, 'BAR', [tonight.performanceId], undefined, confirmed.map(row => row.performanceId))

      database.batch([['UPDATE shifts SET status = ?, user_id = NULL WHERE id = ?', 'OPEN', shiftId]])
      const found = read<Found>(database, reportOfficerBypassesQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found).toEqual([{ role: 'BAR', officerName: 'Someone officer', confirmedShift: 1 }])
    })
  })

  test('a duty manager confirmed after the officer ticked does not turn "with no" into "beside"', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const confirmed = read<{ performanceId: string }>(database, performancesWithConfirmedRoleQuery('DUTY_MANAGER', tonight.venueId, tonight.night))
      expect(confirmed).toEqual([])
      bypass(database, person(database, 'officer'), tonight.night, tonight.venueId, 'DUTY_MANAGER', [tonight.performanceId], undefined, [])

      shift(database, tonight.performanceId, 'DUTY_MANAGER', person(database, 'amy'))
      const found = read<Found>(database, reportOfficerBypassesQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found.map(row => row.confirmedShift)).toEqual([0])
    })
  })

  test('the snapshot is per performance: a matinee\'s confirmed shift is not the evening\'s', async () => {
    await withDatabase((database) => {
      const matinee = tonightsPerformance(database, { suffix: 'matinee' })
      const evening = tonightsPerformance(database, { suffix: 'evening', venueId: matinee.venueId })
      shift(database, matinee.performanceId, 'DOOR', person(database, 'ben'))
      shift(database, evening.performanceId, 'BAR', person(database, 'cara'))
      shift(database, evening.performanceId, 'DOOR', person(database, 'dan'), 'CLAIMED')

      const confirmed = read<{ performanceId: string }>(database, performancesWithConfirmedRoleQuery('DOOR', matinee.venueId, matinee.night))
      expect(confirmed.map(row => row.performanceId)).toEqual([matinee.performanceId])
      bypass(database, person(database, 'officer'), matinee.night, matinee.venueId, 'DOOR', [matinee.performanceId, evening.performanceId], undefined, [matinee.performanceId])

      const flag = (performanceId: string): number[] =>
        read<Found>(database, reportOfficerBypassesQuery(performanceId, matinee.venueId, matinee.night)).map(row => row.confirmedShift)
      expect(flag(matinee.performanceId)).toEqual([1])
      expect(flag(evening.performanceId)).toEqual([0])
    })
  })

  test('a row written before the snapshot existed still reads today\'s rota', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      shift(database, tonight.performanceId, 'DOOR', person(database, 'ben'))
      bypass(database, person(database, 'officer'), tonight.night, tonight.venueId, 'DOOR', [tonight.performanceId])

      const found = read<Found>(database, reportOfficerBypassesQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found.map(row => row.confirmedShift)).toEqual([1])
    })
  })
})
