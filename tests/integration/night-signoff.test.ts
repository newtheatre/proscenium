import { describe, expect, test } from 'bun:test'
import {
  addAddendumStatement,
  addendaForReportQuery,
  deliveriesForReportQuery,
  reportForPerformanceQuery,
  signOffStatement,
} from '#server/utils/night-signoff'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { NightReport } from '#server/utils/night-report'
import type { SQL } from 'drizzle-orm'

// E-124's pure statement and query builders against the real migrations. The async wrappers and
// the routes that call them are covered by `tests/e2e/night-signoff.test.ts` instead.

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

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

function house(database: TestDatabase, suffix: string): { venueId: string, performanceId: string, night: string } {
  const venueId = testVenue(database, { suffix }).id
  const { performanceId, night } = tonightsPerformance(database, { suffix, venueId })
  return { venueId, performanceId, night }
}

const REPORT: NightReport = {
  performanceId: 'placeholder',
  attendance: { sold: 10, admitted: 8, noShows: 2, walkUps: 0, passAdmissions: 0, fellowshipAdmissions: 0 },
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

describe('signOffStatement (criterion 1)', () => {
  test('inserts once, and a second call for the same performance inserts nothing', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer')
      const { performanceId, venueId, night } = house(database, 'signoff-once')

      const first = run(database, signOffStatement({
        id: 'report-1', performanceId, venueId, night, closingNote: 'First', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'SHIFT',
      }))
      expect(first).toHaveLength(1)

      const second = run(database, signOffStatement({
        id: 'report-2', performanceId, venueId, night, closingNote: 'Second', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'OFFICER',
      }))
      expect(second).toHaveLength(0)

      const stored = rows<{ id: string, closing_note: string }>(database, 'SELECT id, closing_note FROM night_reports WHERE performance_id = ?', performanceId)
      expect(stored).toEqual([{ id: 'report-1', closing_note: 'First' }])
    })
  })

  test('the row cannot be updated or deleted (append-only, 0010)', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer-immutable')
      const { performanceId, venueId, night } = house(database, 'signoff-immutable')
      run(database, signOffStatement({
        id: 'report-immutable', performanceId, venueId, night, closingNote: 'Original', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'SHIFT',
      }))

      expect(() => database.raw.exec(`UPDATE night_reports SET closing_note = 'Changed' WHERE id = 'report-immutable'`))
        .toThrow(/append-only/)
      expect(() => database.raw.exec(`DELETE FROM night_reports WHERE id = 'report-immutable'`))
        .toThrow(/append-only/)
    })
  })
})

describe('a SYSTEM auto-close carries no signatory (E-125 criterion 2, 0090)', () => {
  test('signedBy null and signedVia SYSTEM inserts cleanly', async () => {
    await withDatabase((database) => {
      const { performanceId, venueId, night } = house(database, 'signoff-system')

      const inserted = run(database, signOffStatement({
        id: 'report-system', performanceId, venueId, night, closingNote: 'Closed automatically', report: { ...REPORT, performanceId },
        signedBy: null, signedVia: 'SYSTEM',
      }))
      expect(inserted).toHaveLength(1)

      const [stored] = rows<{ signed_by: string | null, signed_via: string }>(database, 'SELECT signed_by, signed_via FROM night_reports WHERE performance_id = ?', performanceId)
      expect(stored).toEqual({ signed_by: null, signed_via: 'SYSTEM' })
    })
  })

  test('a human signature and SYSTEM together are refused by the shape check', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer-system-shape')
      const { performanceId, venueId, night } = house(database, 'signoff-system-shape')

      expect(() => database.raw.exec(`
        INSERT INTO night_reports (id, performance_id, venue_id, night, closing_note, report, signed_by, signed_via)
        VALUES ('bad-1', '${performanceId}', '${venueId}', '${night}', 'x', '{}', '${dm}', 'SYSTEM')
      `)).toThrow(/night_reports_system_has_no_signatory/)
    })
  })

  test('SHIFT or OFFICER with no signatory is refused by the same shape check', async () => {
    await withDatabase((database) => {
      const { performanceId, venueId, night } = house(database, 'signoff-missing-shape')

      expect(() => database.raw.exec(`
        INSERT INTO night_reports (id, performance_id, venue_id, night, closing_note, report, signed_via)
        VALUES ('bad-2', '${performanceId}', '${venueId}', '${night}', 'x', '{}', 'SHIFT')
      `)).toThrow(/night_reports_system_has_no_signatory/)
    })
  })
})

describe('reportForPerformanceQuery', () => {
  test('joins the signer\'s name onto the frozen row', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer-named')
      database.batch([['UPDATE users SET name = ? WHERE id = ?', 'Sam Signer', dm]])
      const { performanceId, venueId, night } = house(database, 'signoff-named')
      run(database, signOffStatement({
        id: 'report-named', performanceId, venueId, night, closingNote: 'Note', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'SHIFT',
      }))

      const [row] = run(database, reportForPerformanceQuery(performanceId))
      expect(row).toMatchObject({ id: 'report-named', signedByName: 'Sam Signer', signedVia: 'SHIFT' })
    })
  })

  // An INNER JOIN on `signed_by` would silently drop a SYSTEM row from every read (E-125).
  test('a SYSTEM row still reads back, with a null signer and a null name', async () => {
    await withDatabase((database) => {
      const { performanceId, venueId, night } = house(database, 'signoff-system-read')
      run(database, signOffStatement({
        id: 'report-system-read', performanceId, venueId, night, closingNote: 'Closed automatically', report: { ...REPORT, performanceId },
        signedBy: null, signedVia: 'SYSTEM',
      }))

      const [row] = run(database, reportForPerformanceQuery(performanceId))
      expect(row).toMatchObject({ id: 'report-system-read', signedBy: null, signedByName: null, signedVia: 'SYSTEM' })
    })
  })
})

describe('addAddendumStatement and addendaForReportQuery (criterion 5)', () => {
  test('inserts a correction, readable back with its author\'s name', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer-addenda')
      database.batch([['UPDATE users SET name = ? WHERE id = ?', 'Alex Addendum', dm]])
      const { performanceId, venueId, night } = house(database, 'signoff-addenda')
      run(database, signOffStatement({
        id: 'report-addenda', performanceId, venueId, night, closingNote: 'Note', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'SHIFT',
      }))

      run(database, addAddendumStatement({ id: 'addendum-1', reportId: 'report-addenda', note: 'A correction', addedBy: dm }))

      const [entry] = run(database, addendaForReportQuery('report-addenda'))
      expect(entry).toMatchObject({ note: 'A correction', addedByName: 'Alex Addendum' })
    })
  })

  test('more than one addendum is allowed, returned oldest first', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer-addenda-order')
      const { performanceId, venueId, night } = house(database, 'signoff-addenda-order')
      run(database, signOffStatement({
        id: 'report-addenda-order', performanceId, venueId, night, closingNote: 'Note', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'SHIFT',
      }))

      // Explicit, distinct timestamps: `addAddendumStatement` defaults to `unixepoch()`, too
      // coarse to separate two inserts made in the same test.
      database.batch([
        ['INSERT INTO night_report_addenda (id, report_id, note, added_by, added_at) VALUES (?, ?, ?, ?, ?)',
          'addendum-order-1', 'report-addenda-order', 'First correction', dm, 1000],
        ['INSERT INTO night_report_addenda (id, report_id, note, added_by, added_at) VALUES (?, ?, ?, ?, ?)',
          'addendum-order-2', 'report-addenda-order', 'Second correction', dm, 2000],
      ])

      const entries = run(database, addendaForReportQuery('report-addenda-order'))
      expect(entries.map(entry => entry.note)).toEqual(['First correction', 'Second correction'])
    })
  })

  test('an addendum cannot be updated or deleted either', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer-addenda-immutable')
      const { performanceId, venueId, night } = house(database, 'signoff-addenda-immutable')
      run(database, signOffStatement({
        id: 'report-addenda-immutable', performanceId, venueId, night, closingNote: 'Note', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'SHIFT',
      }))
      run(database, addAddendumStatement({ id: 'addendum-immutable', reportId: 'report-addenda-immutable', note: 'Original', addedBy: dm }))

      expect(() => database.raw.exec(`UPDATE night_report_addenda SET note = 'Changed' WHERE id = 'addendum-immutable'`))
        .toThrow(/append-only/)
    })
  })
})

describe('deliveriesForReportQuery (criterion 4)', () => {
  test('returns one row per attempt in the order they were made', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer-deliveries')
      const { performanceId, venueId, night } = house(database, 'signoff-deliveries')
      run(database, signOffStatement({
        id: 'report-deliveries', performanceId, venueId, night, closingNote: 'Note', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'SHIFT',
      }))
      database.batch([
        ['INSERT INTO night_report_deliveries (id, report_id, recipient, status, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          'delivery-1', 'report-deliveries', 'first@e2e.newtheatre.org.uk', 'SENT', 1000, 1000],
        ['INSERT INTO night_report_deliveries (id, report_id, recipient, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          'delivery-2', 'report-deliveries', 'second@e2e.newtheatre.org.uk', 'FAILED', 'boom', 1001],
      ])

      const entries = run(database, deliveriesForReportQuery('report-deliveries'))
      expect(entries).toEqual([
        { id: 'delivery-1', recipient: 'first@e2e.newtheatre.org.uk', status: 'SENT', error: null, sentAt: 1000, createdAt: 1000 },
        { id: 'delivery-2', recipient: 'second@e2e.newtheatre.org.uk', status: 'FAILED', error: 'boom', sentAt: null, createdAt: 1001 },
      ])
    })
  })

  test('a delivery row cannot be updated or deleted either', async () => {
    await withDatabase((database) => {
      const dm = person(database, 'signer-deliveries-immutable')
      const { performanceId, venueId, night } = house(database, 'signoff-deliveries-immutable')
      run(database, signOffStatement({
        id: 'report-deliveries-immutable', performanceId, venueId, night, closingNote: 'Note', report: { ...REPORT, performanceId },
        signedBy: dm, signedVia: 'SHIFT',
      }))
      database.batch([['INSERT INTO night_report_deliveries (id, report_id, recipient, status) VALUES (?, ?, ?, ?)',
        'delivery-immutable', 'report-deliveries-immutable', 'someone@e2e.newtheatre.org.uk', 'SENT']])

      expect(() => database.raw.exec(`UPDATE night_report_deliveries SET status = 'FAILED' WHERE id = 'delivery-immutable'`))
        .toThrow(/append-only/)
    })
  })
})
