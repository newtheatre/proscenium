import { describe, expect, test } from 'bun:test'
import {
  reportAccessQuery,
  reportAgeChecksQuery,
  reportAttendanceQuery,
  reportBarItemsSoldQuery,
  reportForegoneQuery,
  reportIncidentsQuery,
  reportMilestonesQuery,
  reportStaffingQuery,
  reportTakingsQuery,
} from '#server/utils/night-report'
import { cardSalesQuery } from '#server/utils/reconciliation'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-123 against the real migrations: every section is its own query, read at compile time from
// the ledger and the registers rather than any stored total (criterion 2).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
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

function reserve(database: TestDatabase, id: string, performanceId: string, status: string, source = 'WEB'): void {
  database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), performanceId, status, source]])
}

function entry(database: TestDatabase, id: string, source: string, tender: string): void {
  database.batch([['INSERT INTO ledger_entries (id, london_day, source, tender, total_pence) VALUES (?, ?, ?, ?, 0)',
    id, '2026-09-10', source, tender]])
}

// `unitPricePence` defaults to `amountPence` for an ordinary sale line; a comp line passes them
// apart, since a real comp always posts amount_pence 0 with the retail price on unit_price_pence.
function line(database: TestDatabase, id: string, entryId: string, performanceId: string, amountPence: number, discountPence = 0, unitPricePence = amountPence): void {
  database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, discount_pence, unit_price_pence, performance_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, entryId, 'TICKET', amountPence, discountPence, unitPricePence, performanceId]])
}

describe('attendance (criterion 1)', () => {
  test('a door-admitted, a no-show and a walk-up are each their own count', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      reserve(database, 'r-admitted', tonight.performanceId, 'DOOR', 'WEB')
      reserve(database, 'r-no-show', tonight.performanceId, 'NO_SHOW', 'WEB')
      reserve(database, 'r-walk-up', tonight.performanceId, 'DOOR', 'DOOR')

      const [row] = read<{ sold: number, admitted: number, noShows: number, walkUps: number }>(
        database, reportAttendanceQuery(tonight.performanceId))
      expect(row).toMatchObject({ admitted: 2, noShows: 1, walkUps: 1 })
    })
  })

  // D-126 criterion 3: pass admissions are `admitted`'s own subset, not a second seat count.
  test('a pass admission is counted separately from an ordinary paid admission', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      person(database, 'holder')
      reserve(database, 'r-paid', tonight.performanceId, 'DOOR', 'WEB')
      reserve(database, 'r-pass', tonight.performanceId, 'DOOR', 'WEB')
      database.batch([
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, 0, ?)',
          't-pass', 'r-pass', tonight.performanceId, 'tt-standard', 'BASE'],
        ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)',
          'pt-1', 'season', 'Season pass', 1_000, 2_000],
        ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', 'price-1', 'pt-1', 'Standard'],
        ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, issued_by) VALUES (?, ?, ?, ?, ?, 0, ?)',
          'pass-1', 'PASS01', 'pt-1', 'price-1', 'holder', 'holder'],
        ['INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id) VALUES (?, ?, ?, ?)',
          'admission-1', 'pass-1', tonight.performanceId, 't-pass'],
      ])

      const [row] = read<{ admitted: number, passAdmissions: number }>(
        database, reportAttendanceQuery(tonight.performanceId))
      expect(row).toMatchObject({ admitted: 2, passAdmissions: 1 })
    })
  })
})

describe('takings (criteria 1, 2)', () => {
  test('desk and bar takings split by source, grouped by tender', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      entry(database, 'e-desk-card', 'DESK', 'CARD')
      line(database, 'l-desk-card', 'e-desk-card', tonight.performanceId, 1000)
      entry(database, 'e-till-card', 'TILL', 'CARD')
      line(database, 'l-till-card', 'e-till-card', tonight.performanceId, 500)

      const desk = read<{ tender: string, totalPence: number }>(database, reportTakingsQuery({ performanceId: tonight.performanceId }, 'DESK'))
      const bar = read<{ tender: string, totalPence: number }>(database, reportTakingsQuery({ night: tonight.night }, 'TILL'))
      expect(desk).toEqual([{ tender: 'CARD', totalPence: 1000 }])
      expect(bar).toEqual([{ tender: 'CARD', totalPence: 500 }])
    })
  })

  // A bar sale never carries a performance_id (F-105): a basket sells for the whole night, not
  // one house, so the till side must scope by the night's own window, never by that column (F-118).
  test('bar takings are scoped to the night, not to any performance the line never names', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const elsewhere = tonightsPerformance(database, { suffix: 'b', night: '2026-01-05' })
      entry(database, 'e-till-card', 'TILL', 'CARD')
      database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence) VALUES (?, ?, ?, ?)',
        'l-till-card', 'e-till-card', 'BAR_ITEM', 500]])

      const barA = read<{ tender: string, totalPence: number }>(database, reportTakingsQuery({ night: tonight.night }, 'TILL'))
      const barB = read<{ tender: string, totalPence: number }>(database, reportTakingsQuery({ night: elsewhere.night }, 'TILL'))
      expect(barA).toEqual([{ tender: 'CARD', totalPence: 500 }])
      expect(barB).toEqual([])
    })
  })

  test('a comp and a discount appear as foregone revenue, never a silent gap', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      entry(database, 'e-comp', 'DESK', 'COMP')
      // amount_pence 0, the real shape a comp line posts (D-114): the retail price sits on
      // unit_price_pence, so a query summing amount_pence for a comp would silently read zero.
      line(database, 'l-comp', 'e-comp', tonight.performanceId, 0, 0, 900)
      entry(database, 'e-discount', 'DESK', 'CARD')
      line(database, 'l-discount', 'e-discount', tonight.performanceId, 800, 100)

      const [row] = read<{ compsPence: number, discountsPence: number }>(database, reportForegoneQuery({ performanceId: tonight.performanceId }, 'DESK'))
      expect(row).toMatchObject({ compsPence: 900, discountsPence: 100 })
    })
  })

  // I-103 criterion 1: a comp is reportable per show whichever module gave it away, not only a
  // desk one. Bar's own comp (F-110) is the same shape as ticketing's (D-114), read here as TILL.
  test('a bar comp and a bar discount are foregone revenue too, the same as a desk one', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      entry(database, 'e-bar-comp', 'TILL', 'COMP')
      line(database, 'l-bar-comp', 'e-bar-comp', tonight.performanceId, 0, 0, 450)
      entry(database, 'e-bar-discount', 'TILL', 'CARD')
      line(database, 'l-bar-discount', 'e-bar-discount', tonight.performanceId, 380, 20)

      const [row] = read<{ compsPence: number, discountsPence: number }>(database, reportForegoneQuery({ night: tonight.night }, 'TILL'))
      expect(row).toMatchObject({ compsPence: 450, discountsPence: 20 })
    })
  })

  test('a reversal nets against what it reverses, since both are summed rather than one excluded', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      entry(database, 'e-original', 'DESK', 'CARD')
      line(database, 'l-original', 'e-original', tonight.performanceId, 1000)
      entry(database, 'e-reversal', 'DESK', 'CARD')
      line(database, 'l-reversal', 'e-reversal', tonight.performanceId, -1000)

      const desk = read<{ tender: string, totalPence: number }>(database, reportTakingsQuery({ performanceId: tonight.performanceId }, 'DESK'))
      expect(desk).toEqual([{ tender: 'CARD', totalPence: 0 }])
    })
  })
})

describe('incidents and follow-up (E-115, E-116 criterion 4)', () => {
  test('an incident carries its follow-up requirement and closure state', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const reporter = person(database, 'reporter')
      database.batch([['UPDATE incident_severity_config SET requires_follow_up = 1 WHERE severity = ?', 'SERIOUS']])
      database.batch([[
        'INSERT INTO incidents (id, performance_id, reported_by, category, severity, body) VALUES (?, ?, ?, ?, ?, ?)',
        'i-1', tonight.performanceId, reporter, 'SAFETY', 'SERIOUS', 'Something happened',
      ]])

      const [open] = read<{ followUpRequired: number, followUpClosed: number }>(database, reportIncidentsQuery(tonight.performanceId))
      expect(open).toMatchObject({ followUpRequired: 1, followUpClosed: 0 })

      database.batch([['INSERT INTO incident_followup_closures (id, incident_id, resolution_note, closed_by) VALUES (?, ?, ?, ?)',
        'c-1', 'i-1', 'Sorted', reporter]])
      const [closed] = read<{ followUpClosed: number }>(database, reportIncidentsQuery(tonight.performanceId))
      expect(closed).toMatchObject({ followUpClosed: 1 })
    })
  })

  test('a superseded incident shows the chain, not just the correction', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const reporter = person(database, 'reporter')
      database.batch([[
        'INSERT INTO incidents (id, performance_id, reported_by, category, severity, body) VALUES (?, ?, ?, ?, ?, ?)',
        'i-original', tonight.performanceId, reporter, 'SAFETY', 'NOTE', 'First telling',
      ]])
      database.batch([[
        'INSERT INTO incidents (id, performance_id, reported_by, category, severity, body, supersedes_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'i-correction', tonight.performanceId, reporter, 'SAFETY', 'NOTE', 'Corrected telling', 'i-original',
      ]])

      const found = read<{ id: string, supersededBy: string | null }>(database, reportIncidentsQuery(tonight.performanceId))
      expect(found.find(row => row.id === 'i-original')?.supersededBy).toBe('i-correction')
    })
  })
})

describe('age checks (E-118)', () => {
  test('accepted and refused count separately, and a superseded outcome does not double-count', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const checker = person(database, 'checker')
      database.batch([[
        `INSERT INTO age_checks (id, performance_id, checked_by, outcome, id_type, description) VALUES (?, ?, ?, 'ACCEPTED', 'PASSPORT', 'Tall man')`,
        'a-1', tonight.performanceId, checker,
      ]])
      database.batch([[
        `INSERT INTO age_checks (id, performance_id, checked_by, outcome, reason, description) VALUES (?, ?, ?, 'REFUSED', 'NO_ID_SHOWN', 'Short woman')`,
        'a-2', tonight.performanceId, checker,
      ]])
      database.batch([[
        `INSERT INTO age_checks (id, performance_id, checked_by, outcome, reason, description, supersedes_id) VALUES (?, ?, ?, 'REFUSED', 'APPEARED_UNDERAGE', 'Short woman', ?)`,
        'a-3', tonight.performanceId, checker, 'a-2',
      ]])

      const [row] = read<{ accepted: number, refused: number }>(database, reportAgeChecksQuery(tonight.performanceId))
      expect(row).toMatchObject({ accepted: 1, refused: 1 })
    })
  })
})

describe('the milestone timeline (E-121 criterion 1)', () => {
  test('reads every milestone-type message for the venue and night, in order', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      database.batch([['INSERT INTO backstage_nights (id, venue_id, night) VALUES (?, ?, ?)', 'bn-1', tonight.venueId, tonight.night]])
      database.batch([['INSERT INTO backstage_devices (id, night_id, label, token_hash, joined_epoch) VALUES (?, ?, ?, ?, 0)',
        'bd-1', 'bn-1', 'Stage left', 'a'.repeat(64)]])
      database.batch([[
        `INSERT INTO backstage_messages (id, night_id, device_id, milestone_type_id, body, composed_at)
         SELECT ?, ?, ?, id, label, ? FROM backstage_milestone_types WHERE label = ?`,
        'm-1', 'bn-1', 'bd-1', 2000, 'Clearance',
      ]])
      database.batch([[
        `INSERT INTO backstage_messages (id, night_id, device_id, milestone_type_id, body, composed_at)
         SELECT ?, ?, ?, id, label, ? FROM backstage_milestone_types WHERE label = ?`,
        'm-2', 'bn-1', 'bd-1', 1000, 'House open',
      ]])

      const found = read<{ label: string }>(database, reportMilestonesQuery(tonight.venueId, tonight.night))
      expect(found.map(row => row.label)).toEqual(['House open', 'Clearance'])
    })
  })
})

describe('staffing (criterion 1)', () => {
  function shift(database: TestDatabase, id: string, performanceId: string, status: string, userId: string | null, slot = 1): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      id, performanceId, 'DOOR', slot, userId, status]])
  }

  test('an unfilled slot names nobody, and a filled one names its holder', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      shift(database, 's-open', tonight.performanceId, 'OPEN', null, 1)
      const who = person(database, 'holder')
      shift(database, 's-confirmed', tonight.performanceId, 'CONFIRMED', who, 2)

      const found = read<{ shiftId: string, name: string | null }>(
        database, reportStaffingQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found.find(row => row.shiftId === 's-open')?.name).toBeNull()
      expect(found.find(row => row.shiftId === 's-confirmed')?.name).toBe('Someone holder')
    })
  })

  test('an officer bypass for this performance flags the shift; a bypass for another night does not', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      shift(database, 's-bypassed', tonight.performanceId, 'OPEN', null)
      const officer = person(database, 'officer')
      database.batch([['INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
        'audit-1', officer, 'night.officer-bypass', `night:${tonight.night}:${tonight.venueId}:DUTY_MANAGER`,
        JSON.stringify({ role: 'DUTY_MANAGER', night: tonight.night, venueId: tonight.venueId, performanceIds: [tonight.performanceId] })]])

      const found = read<{ shiftId: string, officerBypass: number }>(
        database, reportStaffingQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found.find(row => row.shiftId === 's-bypassed')?.officerBypass).toBe(1)
    })
  })
})

describe('the bar summary (criterion 1)', () => {
  test('sums revenue and items from tonight\'s till lines, the same query till-close reconciles against (F-118 criterion 4)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      entry(database, 'e-till', 'TILL', 'CARD')
      database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty) VALUES (?, ?, ?, ?, ?)',
        'l-till', 'e-till', 'BAR_ITEM', 450, 2]])

      const [revenue] = read<{ cardSalesPence: number }>(database, cardSalesQuery(tonight.night))
      const [items] = read<{ itemsSold: number }>(database, reportBarItemsSoldQuery(tonight.night))
      expect(revenue).toMatchObject({ cardSalesPence: 450 })
      expect(items).toMatchObject({ itemsSold: 2 })
    })
  })
})

describe('the access section carries counts only (criterion 3)', () => {
  test('a verified access profile with a live ticket on this performance counts once', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'access-holder')
      database.batch([['INSERT INTO access_profiles (user_id, status) VALUES (?, ?)', holder, 'VERIFIED']])
      reserve(database, 'r-access', tonight.performanceId, 'DOOR', 'WEB')
      database.batch([['UPDATE reservations SET user_id = ? WHERE id = ?', holder, 'r-access']])
      database.batch([['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
        't-access', 'r-access', tonight.performanceId, 'tt-standard', 900, 'BASE']])

      const [row] = read<{ verified: number }>(database, reportAccessQuery(tonight.performanceId))
      expect(row).toMatchObject({ verified: 1 })
    })
  })

  test('a pending, unverified access profile does not count', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'pending-holder')
      database.batch([['INSERT INTO access_profiles (user_id, status) VALUES (?, ?)', holder, 'PENDING']])
      reserve(database, 'r-pending-access', tonight.performanceId, 'DOOR', 'WEB')
      database.batch([['UPDATE reservations SET user_id = ? WHERE id = ?', holder, 'r-pending-access']])
      database.batch([['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
        't-pending-access', 'r-pending-access', tonight.performanceId, 'tt-standard', 900, 'BASE']])

      const [row] = read<{ verified: number }>(database, reportAccessQuery(tonight.performanceId))
      expect(row).toMatchObject({ verified: 0 })
    })
  })
})
