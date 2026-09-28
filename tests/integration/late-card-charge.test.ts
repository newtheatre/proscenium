import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { boundFrom } from '../../scripts/seed/statements'
import { lateAddendumStatement, lateAdditionsQuery, lateChargesQuery, lateClaimStatement, lateSaleAudit, lateSaleAuditStatement, lateSaleTiming } from '#server/utils/late-charge'
import { cardSalesQuery } from '#server/utils/reconciliation'
import { LATE_CHARGE_PERMISSION, lateChargeTotalRefusal } from '#shared/utils/sumup'
import { permissionsFor } from '#shared/utils/roles'
import { showNightOpensAt } from '#shared/utils/show-night'
import { londonDayOf } from '#shared/utils/ledger'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { Role } from '#shared/utils/roles'
import type { SQL } from 'drizzle-orm'
import type { TestDatabase } from '#tests/helpers/database'

// Question 15, option 1 (F-124 criterion 9): a card charge an earlier night's closed till left
// unanswered is recorded by the Treasurer as a sale on that night, audited as late.

const EARLIER = '2026-09-20'
const TONIGHT = '2026-09-27'
// 21:00 on the earlier night: the moment the reader took the money.
const CHARGED_AT = showNightOpensAt(EARLIER) + 17 * 3600

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

// postEntry only builds statements, so a stand-in binding reaches it outside a Nitro request.
async function ledgerWriter(): Promise<typeof import('../../server/utils/ledger')> {
  const globals = globalThis as { __env__?: Record<string, unknown> }
  globals.__env__ = { ...globals.__env__, DB: globals.__env__?.DB ?? {} }
  return import('../../server/utils/ledger')
}

function run<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`, ...Object.values(values)]])
}

interface Night { venueId: string, performanceId: string }

// A bar's till on the earlier night, closed with a charge on it that nobody answered.
function leftUnanswered(database: TestDatabase, options: { closed?: boolean } = {}): Night {
  insert(database, 'users', { id: 'u-bar', email: 'bar@example.invalid', name: 'Bar Person' })
  insert(database, 'users', { id: 'u-treasurer', email: 'treasurer@example.invalid', name: 'The Treasurer' })
  const { venueId, performanceId } = tonightsPerformance(database, { night: EARLIER, suffix: 'late' })
  const opened = showNightOpensAt(EARLIER) + 14 * 3600
  insert(database, 'till_sessions', {
    id: 't-1', venue_id: venueId, night: EARLIER, opened_by: 'u-bar', opened_at: opened,
    ...(options.closed === false ? {} : { closed_by: 'u-bar', closed_at: opened + 10 * 3600 }),
  })
  insert(database, 'sumup_attempts', {
    id: 'att-1', till_session_id: 't-1', venue_id: venueId, night: EARLIER, created_by: 'u-bar',
    created_at: CHARGED_AT, basket: '{}', expected_total_pence: 450, status: 'STARTED',
  })
  return { venueId, performanceId }
}

// What recordLateCharge commits once the claim lands: the sale at the charge's own moment, on
// the closed session, keyed to that night's performance.
async function postLate(database: TestDatabase, night: Night): Promise<string> {
  const { postEntry } = await ledgerWriter()
  const timing = lateSaleTiming(CHARGED_AT)
  const posted = postEntry({
    source: 'TILL',
    tender: 'CARD',
    actorId: 'u-bar',
    tillSessionId: 't-1',
    lines: [{ kind: 'BAR_ITEM', amountPence: 450, qty: 1, unitPricePence: 450, performanceId: night.performanceId }],
  }, timing.at)
  database.batch(boundFrom(posted.statements))
  const entry = lateSaleAudit({ recorderId: 'u-treasurer', entryId: posted.id, attemptId: 'att-1', venueId: night.venueId, night: EARLIER, chargedAt: CHARGED_AT })
  run(database, lateSaleAuditStatement(entry, posted.id))
  return posted.id
}

const status = (database: TestDatabase): string =>
  rows<{ status: string }>(database, 'SELECT status FROM sumup_attempts WHERE id = ?', 'att-1')[0]!.status

describe('a late card charge lands on its own night (question 15, F-124 criterion 9)', () => {
  test('the charge is listed for that night once its till is closed, and not while it is open', async () => {
    await withDatabase((database) => {
      leftUnanswered(database)
      expect(run<{ id: string }>(database, lateChargesQuery(EARLIER)).map(row => row.id)).toEqual(['att-1'])
      expect(run(database, lateChargesQuery(TONIGHT))).toEqual([])
    })
    await withDatabase((database) => {
      leftUnanswered(database, { closed: false })
      expect(run(database, lateChargesQuery(EARLIER))).toEqual([])
      expect(run(database, lateClaimStatement('att-1', 450, 'u-treasurer'))).toEqual([])
    })
  })

  test('the sale is dated to the charge, keyed to that night\'s performance, and the expected figure rises to it', async () => {
    await withDatabase(async (database) => {
      const night = leftUnanswered(database)
      expect(run<{ cardSalesPence: number }>(database, cardSalesQuery(EARLIER))[0]!.cardSalesPence).toBe(0)

      expect(run(database, lateClaimStatement('att-1', 450, 'u-treasurer'))).toHaveLength(1)
      expect(status(database)).toBe('COMPLETING')
      const entryId = await postLate(database, night)

      const [entry] = rows<{ happenedAt: number, londonDay: string, sessionId: string }>(database,
        'SELECT happened_at AS happenedAt, london_day AS londonDay, till_session_id AS sessionId FROM ledger_entries WHERE id = ?', entryId)
      expect(entry).toEqual({ happenedAt: CHARGED_AT, londonDay: londonDayOf(new Date(CHARGED_AT * 1000)), sessionId: 't-1' })
      expect(rows<{ performanceId: string }>(database, 'SELECT performance_id AS performanceId FROM ledger_lines WHERE entry_id = ?', entryId))
        .toEqual([{ performanceId: night.performanceId }])
      // The reader's Z for the night already held the £4.50: what we expect now meets it.
      expect(run<{ cardSalesPence: number }>(database, cardSalesQuery(EARLIER))[0]!.cardSalesPence).toBe(450)
      expect(run<{ cardSalesPence: number }>(database, cardSalesQuery(TONIGHT))[0]!.cardSalesPence).toBe(0)
    })
  })

  test('the prices are read as of the charge\'s own day', () => {
    expect(lateSaleTiming(CHARGED_AT).on).toBe(londonDayOf(new Date(CHARGED_AT * 1000)))
    expect(lateSaleTiming(CHARGED_AT).at.getTime()).toBe(CHARGED_AT * 1000)
  })
})

describe('the audit marks it late, naming who recorded it and when', () => {
  test('the entry is audited as late, and listed for the Treasurer and the night report', async () => {
    await withDatabase(async (database) => {
      const night = leftUnanswered(database)
      run(database, lateClaimStatement('att-1', 450, 'u-treasurer'))
      const entryId = await postLate(database, night)

      const [audit] = rows<{ actorId: string, action: string, detail: string, createdAt: number }>(database,
        `SELECT actor_id AS actorId, action, detail, created_at AS createdAt FROM audit_log WHERE action = 'bar.till.sale.late'`)
      expect(audit!.actorId).toBe('u-treasurer')
      expect(JSON.parse(audit!.detail)).toEqual({ late: true, night: EARLIER, venueId: night.venueId, attemptId: 'att-1', entryId, chargedAt: CHARGED_AT })

      expect(run(database, lateAdditionsQuery(EARLIER))).toEqual([{
        entryId, totalPence: 450, chargedAt: CHARGED_AT, recordedAt: audit!.createdAt, recordedByName: 'The Treasurer', venueName: expect.any(String),
      }])
      expect(run(database, lateAdditionsQuery(TONIGHT))).toEqual([])
    })
  })

  test('no late audit is written for an entry that did not post', async () => {
    await withDatabase((database) => {
      const night = leftUnanswered(database)
      const entry = lateSaleAudit({ recorderId: 'u-treasurer', entryId: 'never', attemptId: 'att-1', venueId: night.venueId, night: EARLIER, chargedAt: CHARGED_AT })
      run(database, lateSaleAuditStatement(entry, 'never'))
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'bar.till.sale.late'`)).toEqual([])
    })
  })

  test('a night already signed off gains an addendum saying so', async () => {
    await withDatabase(async (database) => {
      const night = leftUnanswered(database)
      insert(database, 'night_reports', {
        id: 'r-1', performance_id: night.performanceId, venue_id: night.venueId, night: EARLIER,
        closing_note: 'A quiet night', report: '{}', signed_by: 'u-bar', signed_via: 'SHIFT',
      })
      run(database, lateClaimStatement('att-1', 450, 'u-treasurer'))
      const entryId = await postLate(database, night)
      run(database, lateAddendumStatement({ id: 'add-1', venueId: night.venueId, night: EARLIER, entryId, addedBy: 'u-treasurer', totalPence: 450, chargedAt: CHARGED_AT }))

      const [addendum] = rows<{ reportId: string, note: string, addedBy: string }>(database,
        'SELECT report_id AS reportId, note, added_by AS addedBy FROM night_report_addenda')
      expect(addendum).toMatchObject({ reportId: 'r-1', addedBy: 'u-treasurer' })
      expect(addendum!.note).toContain('Late addition')
      expect(addendum!.note).toContain('£4.50')
    })
  })
})

describe('the Treasurer alone records it, against the total the screen showed (0005)', () => {
  test('a stale expected total claims nothing, and the refusal quotes both figures', async () => {
    await withDatabase((database) => {
      leftUnanswered(database)
      expect(run(database, lateClaimStatement('att-1', 400, 'u-treasurer'))).toEqual([])
      expect(status(database)).toBe('STARTED')
    })
    const refusal = lateChargeTotalRefusal(400, 450)
    expect(refusal).toContain('£4.00')
    expect(refusal).toContain('£4.50')
  })

  test('a charge already answered, or already posted, is not claimed again', async () => {
    await withDatabase((database) => {
      leftUnanswered(database)
      expect(run(database, lateClaimStatement('att-1', 450, 'u-treasurer'))).toHaveLength(1)
      expect(run(database, lateClaimStatement('att-1', 450, 'u-treasurer'))).toEqual([])
    })
  })

  test('only a finance.write holder may record it: the Treasurer and ADMIN, never the bar', () => {
    const now = new Date()
    const holds = (role: Role): boolean => permissionsFor([{ role, expiresAt: null }], now).has(LATE_CHARGE_PERMISSION)
    expect(LATE_CHARGE_PERMISSION).toBe('finance.write')
    expect(holds('TREASURER')).toBe(true)
    expect(holds('ADMIN')).toBe(true)
    for (const role of ['BAR_MANAGER', 'FOH_MANAGER', 'COMMITTEE', 'THEATRE_MANAGER'] as Role[]) expect(holds(role)).toBe(false)

    const route = readFileSync('server/api/admin/finance/late-charges/[id].post.ts', 'utf8')
    expect(route).toContain('requirePermission(event, LATE_CHARGE_PERMISSION)')
    expect(route.indexOf('requirePermission(')).toBeLessThan(route.indexOf('recordLateCharge('))
  })
})
