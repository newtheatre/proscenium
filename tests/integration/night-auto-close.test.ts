import { describe, expect, test } from 'bun:test'
import { autoCloseFrom, autoCloseFromPreview, pastTheirClose, unclosedCandidatesQuery } from '#server/utils/night-auto-close'
import { signOffStatement } from '#server/utils/night-signoff'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { showNightBounds } from '#shared/utils/show-night'
import type { UnclosedCandidateRow } from '#server/utils/night-auto-close'
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
// The first night the new system ran for real: NIGHT's own 04:00 start.
const FROM = autoCloseFrom(NIGHT)!

const REPORT: NightReport = {
  performanceId: 'placeholder',
  attendance: { sold: 0, admitted: 0, noShows: 0, walkUps: 0, passAdmissions: 0, fellowshipAdmissions: 0 },
  takings: {
    desk: { tenders: [], compsPence: 0, discountsPence: 0 },
    bar: { tenders: [], compsPence: 0, discountsPence: 0 },
  },
  incidents: [],
  ageChecks: { accepted: 0, refused: 0, notRequired: 0 },
  milestones: [],
  staffing: [],
  bypasses: [],
  covers: [],
  bar: { revenuePence: 0, itemsSold: 0 },
  access: { verified: 0 },
  checklist: [],
}

describe('unclosedCandidatesQuery (criterion 1)', () => {
  test('names a performance with no report yet', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database, { night: NIGHT, suffix: 'candidate-open' })
      const now = Math.floor(NIGHT_END.getTime() / 1000) + 24 * 60 * 60

      const candidates = run(database, unclosedCandidatesQuery(now, FROM)).map(row => row.performanceId)
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

      const candidates = run(database, unclosedCandidatesQuery(now, FROM)).map(row => row.performanceId)
      expect(candidates).not.toContain(performanceId)
    })
  })

  test('excludes a cancelled performance', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database, { night: NIGHT, suffix: 'candidate-cancelled', status: 'CANCELLED' })
      const now = Math.floor(NIGHT_END.getTime() / 1000) + 24 * 60 * 60

      const candidates = run(database, unclosedCandidatesQuery(now, FROM)).map(row => row.performanceId)
      expect(candidates).not.toContain(performanceId)
    })
  })

  // Imported history has no report and never will: the sweep must not freeze and mail it (E-125).
  test('excludes a performance before the first night the system ran, and keeps one on it', async () => {
    await withDatabase((database) => {
      const imported = tonightsPerformance(database, { night: '2026-08-31', suffix: 'candidate-imported' })
      const first = tonightsPerformance(database, { night: NIGHT, suffix: 'candidate-first', curtainHoursAfterNightStart: 0 })
      const now = Math.floor(NIGHT_END.getTime() / 1000) + 24 * 60 * 60

      const candidates = run(database, unclosedCandidatesQuery(now, FROM)).map(row => row.performanceId)
      expect(candidates).not.toContain(imported.performanceId)
      expect(candidates).toContain(first.performanceId)
    })
  })

  test('excludes a performance that has not started yet', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database, { night: '2099-01-01', suffix: 'candidate-future' })
      const now = Math.floor(NIGHT_END.getTime() / 1000) + 24 * 60 * 60

      const candidates = run(database, unclosedCandidatesQuery(now, FROM)).map(row => row.performanceId)
      expect(candidates).not.toContain(performanceId)
    })
  })
})

// J-105: saving the key previews what the next sweep would freeze and mail, through the sweep's
// own query and cut, so the preview and the sweep cannot disagree.
describe('the preview of saving AUTO_CLOSE_FROM_NIGHT', () => {
  // The 2026-09-02 night's own close: it is due, the 2026-09-03 night has started but is not.
  const AT = new Date(showNightBounds('2026-09-02').to.getTime() + 24 * 60 * 60 * 1000)

  function previewCount(database: TestDatabase, proposed: string): number {
    const now = Math.floor(AT.getTime() / 1000)
    const candidates = run(database, unclosedCandidatesQuery(now, autoCloseFrom(proposed)!)) as unknown as UnclosedCandidateRow[]
    return pastTheirClose(candidates, AT).length
  }

  function seed(database: TestDatabase): void {
    tonightsPerformance(database, { night: '2026-08-31', suffix: 'preview-imported', curtainHoursAfterNightStart: 15 })
    tonightsPerformance(database, { night: NIGHT, suffix: 'preview-first', curtainHoursAfterNightStart: 15 })
    tonightsPerformance(database, { night: '2026-09-02', suffix: 'preview-second', curtainHoursAfterNightStart: 15 })
    tonightsPerformance(database, { night: '2026-09-03', suffix: 'preview-open', curtainHoursAfterNightStart: 15 })
    const signed = tonightsPerformance(database, { night: NIGHT, suffix: 'preview-signed', curtainHoursAfterNightStart: 15 })
    run(database, signOffStatement({
      id: 'report-preview-signed', performanceId: signed.performanceId, venueId: signed.venueId, night: NIGHT,
      closingNote: 'Signed', report: { ...REPORT, performanceId: signed.performanceId }, signedBy: null, signedVia: 'SYSTEM',
    }))
  }

  test('counts the unreported performances from the proposed night on that are past their close', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(previewCount(database, NIGHT)).toBe(2)
    })
  })

  test('a night set a day too early counts the imported performance it would mail', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(previewCount(database, '2026-08-31')).toBe(3)
    })
  })

  test('a night whose performances have not yet reached their close counts none', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(previewCount(database, '2026-09-03')).toBe(0)
    })
  })

  test('an unset or unreadable night previews nothing, reading no table', async () => {
    expect(await autoCloseFromPreview(null, AT)).toBe(0)
    expect(await autoCloseFromPreview(undefined, AT)).toBe(0)
    expect(await autoCloseFromPreview('26 October', AT)).toBe(0)
  })
})
