import { describe, expect, test } from 'bun:test'
import { unclosedCandidatesQuery } from '#server/utils/night-auto-close'
import { signOffStatement } from '#server/utils/night-signoff'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { showNightBounds } from '#shared/utils/show-night'
import type { NightReport } from '#server/utils/night-report'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-125's candidate query against the real migrations. The deadline is pure, pinned in
// `tests/unit`; `autoCloseNight()` needs the live `db` singleton, covered by `tests/e2e` instead.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): Record<string, unknown>[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows(database, query, ...parameters)
}

const NIGHT = '2026-09-01'
const NIGHT_END = showNightBounds(NIGHT).to

const REPORT: NightReport = {
  performanceId: 'placeholder',
  attendance: { sold: 0, admitted: 0, noShows: 0, walkUps: 0, passAdmissions: 0 },
  takings: {
    desk: { tenders: [], compsPence: 0, discountsPence: 0 },
    bar: { tenders: [], compsPence: 0, discountsPence: 0 },
  },
  incidents: [],
  ageChecks: { accepted: 0, refused: 0 },
  milestones: [],
  staffing: [],
  bar: { revenuePence: 0, itemsSold: 0 },
  access: { verified: 0 },
  checklist: [],
}

describe('unclosedCandidatesQuery (criterion 1)', () => {
  test('names a performance with no report yet', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database, { night: NIGHT, suffix: 'candidate-open' })
      const now = Math.floor(NIGHT_END.getTime() / 1000) + 24 * 60 * 60

      const candidates = run(database, unclosedCandidatesQuery(now)).map(row => row.performanceId)
      expect(candidates).toContain(performanceId)
    })
  })

  test('excludes a performance already signed off', async () => {
    await withDatabase((database) => {
      const { performanceId, venueId } = tonightsPerformance(database, { night: NIGHT, suffix: 'candidate-signed' })
      run(database, signOffStatement({
        id: 'report-candidate-signed', performanceId, venueId, night: NIGHT, closingNote: 'Closed automatically',
        report: { ...REPORT, performanceId }, signedBy: null, signedVia: 'SYSTEM',
      }))
      const now = Math.floor(NIGHT_END.getTime() / 1000) + 24 * 60 * 60

      const candidates = run(database, unclosedCandidatesQuery(now)).map(row => row.performanceId)
      expect(candidates).not.toContain(performanceId)
    })
  })

  test('excludes a cancelled performance', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database, { night: NIGHT, suffix: 'candidate-cancelled', status: 'CANCELLED' })
      const now = Math.floor(NIGHT_END.getTime() / 1000) + 24 * 60 * 60

      const candidates = run(database, unclosedCandidatesQuery(now)).map(row => row.performanceId)
      expect(candidates).not.toContain(performanceId)
    })
  })

  test('excludes a performance that has not started yet', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database, { night: '2099-01-01', suffix: 'candidate-future' })
      const now = Math.floor(NIGHT_END.getTime() / 1000) + 24 * 60 * 60

      const candidates = run(database, unclosedCandidatesQuery(now)).map(row => row.performanceId)
      expect(candidates).not.toContain(performanceId)
    })
  })
})
