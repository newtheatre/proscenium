import { describe, expect, test } from 'bun:test'
import { assignOpeningShiftStatement, claimOpeningShiftStatement, createOpeningStatement, stampOpeningShiftsStatement } from '#server/utils/bar-openings'
import { approveShiftStatement, assignShiftStatement, claimShiftStatement, replaceTemplateStatements, shiftGate } from '#server/utils/rota'
import { qualifiedCountQuery } from '#server/utils/rota-readiness'
import { currentShowNight, showNightOpensAt } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Decision 0259 against the real migrations: while the override stands, a live committee role
// stands in for the bar module in every write that confirms somebody on a bar slot.

const NOW = Math.floor(Date.now() / 1000)
const DAY = 86_400
const TODAY = '2026-11-11'
const BAR_MODULE = 'ADMN-102'

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

// Untrained and signed in, so only the grant under test decides: a holder with no sign-in yet is
// pending and holds nothing (A-132).
function member(database: TestDatabase, id: string, grant?: { role: string, expiresAt?: number }): string {
  database.batch([
    ['INSERT OR IGNORE INTO users (id, name, email, verified, last_login_at) VALUES (?, ?, ?, 1, ?)', id, `Someone ${id}`, `${id}@example.invalid`, NOW - DAY],
    ['INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)', 'ADMN', 'Administration'],
    ['INSERT OR IGNORE INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', BAR_MODULE, 'ADMN', 'MODULE', 'Bar induction'],
  ])
  if (grant) {
    database.batch([['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)',
      `grant-${id}`, id, grant.role, grant.expiresAt ?? NOW + 30 * DAY]])
  }
  return id
}

function trainedInBar(database: TestDatabase, id: string): void {
  database.batch([[`INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, '2026-08-21', 'SIGNOFF')`,
    `tr-${id}`, id, BAR_MODULE]])
}

function openShift(database: TestDatabase, performanceId: string, role: string): string {
  const id = `${performanceId}-${role}`
  database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)', id, performanceId, role, 'OPEN']])
  return id
}

const standing = shiftGate('BAR', BAR_MODULE, TODAY, NOW, true)
const ended = shiftGate('BAR', BAR_MODULE, TODAY, NOW, false)

// Each standing a member might hold, and whether the bar admits them untrained while it stands.
const STANDINGS = [
  ['no role at all', undefined, 0],
  ['the Committee role', { role: 'COMMITTEE' }, 1],
  ['the Front of House Manager\'s role', { role: 'FOH_MANAGER' }, 1],
  ['the IT Manager\'s role alone', { role: 'ADMIN' }, 0],
  ['a Committee role that has lapsed', { role: 'COMMITTEE', expiresAt: NOW - DAY }, 0],
] as const

describe('the gate carries the committee alternative for the bar alone, and only while it stands', () => {
  test('only a bar gate built while the override stands', () => {
    expect(standing.committeeInsteadAt).toBe(NOW)
    expect(ended.committeeInsteadAt).toBeUndefined()
    expect(shiftGate('DOOR', 'ADMN-103', TODAY, NOW, true).committeeInsteadAt).toBeUndefined()
    expect(shiftGate('DUTY_MANAGER', 'ADMN-201', TODAY, NOW, true).committeeInsteadAt).toBeUndefined()
  })
})

describe('a performance\'s bar shift while the override stands (0259)', () => {
  test.each(STANDINGS)('an untrained member holding %s claims it', async (_, grant, written) => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = member(database, 'claimant', grant)
      const shiftId = openShift(database, tonight.performanceId, 'BAR')

      expect(run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', standing))).toHaveLength(written)
    })
  })

  test.each(STANDINGS)('an officer assigns an untrained member holding %s', async (_, grant, written) => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const officer = member(database, 'officer', { role: 'FOH_MANAGER' })
      const assignee = member(database, 'assignee', grant)
      const shiftId = openShift(database, tonight.performanceId, 'BAR')

      expect(run(database, assignShiftStatement(shiftId, assignee, officer, standing))).toHaveLength(written)
    })
  })

  test('a trained member off the committee is still admitted', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = member(database, 'trained')
      trainedInBar(database, claimant)
      const shiftId = openShift(database, tonight.performanceId, 'BAR')

      expect(run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', standing))).toHaveLength(1)
    })
  })

  test('with no bar module named, the committee is still admitted and nobody else is', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const committee = member(database, 'committee', { role: 'COMMITTEE' })
      const other = member(database, 'other')
      const unnamed = shiftGate('BAR', null, TODAY, NOW, true)

      expect(run(database, claimShiftStatement(openShift(database, tonight.performanceId, 'BAR'), other, 'CONFIRMED', unnamed))).toHaveLength(0)
      expect(run(database, claimShiftStatement(`${tonight.performanceId}-BAR`, committee, 'CONFIRMED', unnamed))).toHaveLength(1)
    })
  })

  test('a door shift still asks the committee member for its training', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = member(database, 'door', { role: 'COMMITTEE' })
      const shiftId = openShift(database, tonight.performanceId, 'DOOR')

      expect(run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', shiftGate('DOOR', 'ADMN-103', TODAY, NOW, true)))).toHaveLength(0)
    })
  })
})

describe('once the override has ended (0259)', () => {
  test('an untrained committee member is refused again', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = member(database, 'claimant', { role: 'COMMITTEE' })
      const shiftId = openShift(database, tonight.performanceId, 'BAR')

      expect(run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', ended))).toHaveLength(0)
    })
  })

  test('a claim queued while it stood is re-gated at approval and stays claimed', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = member(database, 'queued', { role: 'COMMITTEE' })
      const shiftId = openShift(database, tonight.performanceId, 'BAR')
      run(database, claimShiftStatement(shiftId, claimant, 'CLAIMED', standing))

      expect(run(database, approveShiftStatement(shiftId, ended))).toHaveLength(0)
      expect(run(database, approveShiftStatement(shiftId, standing))).toHaveLength(1)
    })
  })
})

describe('a bar opening\'s slot while the override stands (0259)', () => {
  function openingSlot(database: TestDatabase): string {
    const venue = testVenue(database)
    const officer = member(database, 'officer', { role: 'FOH_MANAGER' })
    for (const statement of replaceTemplateStatements(venue.id, [{ role: 'BAR', count: 1 }], officer)) run(database, statement)
    const opensAt = showNightOpensAt(currentShowNight()) + 14 * 3600
    run(database, createOpeningStatement('opening-a', { venueId: venue.id, night: currentShowNight(), label: 'Society social', startsAt: opensAt, endsAt: opensAt + 5 * 3600 }, officer))
    run(database, stampOpeningShiftsStatement('opening-a'))
    return rows<{ id: string }>(database, 'SELECT id FROM bar_opening_shifts WHERE opening_id = ?', 'opening-a')[0]!.id
  }

  test('an officer assigns an untrained committee member, and not somebody off the committee', async () => {
    await withDatabase((database) => {
      const slotId = openingSlot(database)
      member(database, 'other')
      member(database, 'committee', { role: 'COMMITTEE' })

      expect(run(database, assignOpeningShiftStatement(slotId, 'other', 'officer', standing))).toHaveLength(0)
      expect(run(database, assignOpeningShiftStatement(slotId, 'committee', 'officer', standing))).toHaveLength(1)
    })
  })

  test('an untrained committee member claims it only while it stands', async () => {
    await withDatabase((database) => {
      const slotId = openingSlot(database)
      member(database, 'committee', { role: 'COMMITTEE' })

      expect(run(database, claimOpeningShiftStatement(slotId, 'committee', 'CONFIRMED', ended))).toHaveLength(0)
      expect(run(database, claimOpeningShiftStatement(slotId, 'committee', 'CONFIRMED', standing))).toHaveLength(1)
    })
  })
})

describe('the readiness count reads the same gate (0210, 0259)', () => {
  test('an untrained committee member counts while it stands, and not after', async () => {
    await withDatabase((database) => {
      member(database, 'committee', { role: 'COMMITTEE' })
      member(database, 'other')
      const count = (gate: typeof standing): number => (run(database, qualifiedCountQuery(gate))[0] as { total: number }).total

      expect(count(standing)).toBe(1)
      expect(count(ended)).toBe(0)
    })
  })
})
