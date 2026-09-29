import { describe, expect, test } from 'bun:test'
import {
  addShiftStatement,
  approveShiftStatement,
  assignShiftStatement,
  claimShiftStatement,
  confirmedShiftsTonightQuery,
  shiftGate,
} from '#server/utils/rota'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Decision 0114 against the real migrations: a duty manager shift needs a live committee role
// beside its training, as a predicate on every write that confirms one and on the night's read.

const NOW = Math.floor(Date.now() / 1000)
const DAY = 86_400
const TODAY = '2026-10-12'
const MODULE = 'ADMN-201'
const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }

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

// Trained and signed in, so only the grant under test decides: a holder with no sign-in yet is
// pending and holds nothing (A-132).
function trained(database: TestDatabase, id: string, grant?: { role: string, expiresAt?: number | null }): string {
  database.batch([
    ['INSERT OR IGNORE INTO users (id, name, email, verified, last_login_at) VALUES (?, ?, ?, 1, ?)', id, `Someone ${id}`, `${id}@example.invalid`, NOW - DAY],
    ['INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)', 'ADMN', 'Administration'],
    ['INSERT OR IGNORE INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', MODULE, 'ADMN', 'MODULE', 'Committee Operations and Governance'],
    [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, '2026-08-21', 'SIGNOFF')`, `tr-${id}`, id, MODULE],
  ])
  if (grant) {
    database.batch([['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)',
      `grant-${id}`, id, grant.role, grant.expiresAt === undefined ? NOW + 30 * DAY : grant.expiresAt]])
  }
  return id
}

function openShift(database: TestDatabase, performanceId: string, role = 'DUTY_MANAGER'): string {
  const id = `${performanceId}-${role}`
  database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, 1, ?)', id, performanceId, role, 'OPEN']])
  return id
}

const statusOf = (database: TestDatabase, shiftId: string): string =>
  rows<{ status: string }>(database, 'SELECT status FROM shifts WHERE id = ?', shiftId)[0]!.status

const dutyManagerGate = shiftGate('DUTY_MANAGER', MODULE, TODAY, NOW)

// Each standing a claimant might hold, and whether a duty manager shift admits them.
const STANDINGS = [
  ['no role at all', undefined, 0],
  ['the Front of House Manager\'s role', { role: 'FOH_MANAGER' }, 1],
  ['the Committee role', { role: 'COMMITTEE' }, 1],
  ['a permanent Committee role', { role: 'COMMITTEE', expiresAt: null }, 1],
  ['the IT Manager\'s role alone', { role: 'ADMIN' }, 0],
  ['a Committee role that has lapsed', { role: 'COMMITTEE', expiresAt: NOW - DAY }, 0],
] as const

describe('the gate a duty manager shift carries (0114)', () => {
  test('a duty manager shift carries the committee role, and the door and the bar do not', () => {
    expect(dutyManagerGate.committeeAt).toBe(NOW)
    expect(shiftGate('DOOR', 'ADMN-103', TODAY, NOW).committeeAt).toBeUndefined()
    expect(shiftGate('BAR', 'ADMN-102', TODAY, NOW).committeeAt).toBeUndefined()
  })
})

describe('claiming a duty manager shift needs a live committee role (E-103 criterion 6)', () => {
  test.each(STANDINGS)('a claimant holding %s', async (_, grant, written) => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = trained(database, 'claimant', grant)
      const shiftId = openShift(database, tonight.performanceId)

      expect(run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', dutyManagerGate))).toHaveLength(written)
      expect(statusOf(database, shiftId)).toBe(written ? 'CONFIRMED' : 'OPEN')
    })
  })

  test('a door shift asks no committee role of anybody', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = trained(database, 'door-claimant')
      const shiftId = openShift(database, tonight.performanceId, 'DOOR')

      expect(run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', shiftGate('DOOR', MODULE, TODAY, NOW)))).toHaveLength(1)
    })
  })

  test('a disabled committee member holds no committee role', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = trained(database, 'disabled', { role: 'COMMITTEE' })
      database.batch([['UPDATE users SET disabled = 1 WHERE id = ?', claimant]])
      const shiftId = openShift(database, tonight.performanceId)

      expect(run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', dutyManagerGate))).toHaveLength(0)
    })
  })

  // The grant is read by the write itself, so one lapsing after the route's check admits nobody.
  test('a grant ended between the check and the write confirms nobody (#1302)', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = trained(database, 'resigning', { role: 'COMMITTEE' })
      const shiftId = openShift(database, tonight.performanceId)
      database.batch([['UPDATE role_grants SET expires_at = ? WHERE user_id = ?', NOW - 1, claimant]])

      expect(run(database, claimShiftStatement(shiftId, claimant, 'CONFIRMED', dutyManagerGate))).toHaveLength(0)
      expect(statusOf(database, shiftId)).toBe('OPEN')
    })
  })
})

describe('confirming a queued duty manager claim re-reads the committee role (E-105 criterion 3)', () => {
  test.each(STANDINGS)('a claimant holding %s', async (_, grant, written) => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const claimant = trained(database, 'queued', grant)
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-queued', tonight.performanceId, 'DUTY_MANAGER', claimant, 'CLAIMED']])

      expect(run(database, approveShiftStatement('shift-queued', dutyManagerGate))).toHaveLength(written)
      expect(statusOf(database, 'shift-queued')).toBe(written ? 'CONFIRMED' : 'CLAIMED')
    })
  })
})

describe('an officer cannot assign a duty manager shift past the committee role (E-107 criterion 3)', () => {
  test.each(STANDINGS)('assigning a member holding %s', async (_, grant, written) => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const officer = trained(database, 'officer', { role: 'FOH_MANAGER' })
      const member = trained(database, 'member', grant)
      const shiftId = openShift(database, tonight.performanceId)

      expect(run(database, assignShiftStatement(shiftId, member, officer, dutyManagerGate))).toHaveLength(written)
    })
  })

  test.each(STANDINGS)('adding a duty manager shift naming a member holding %s', async (_, grant, written) => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const officer = trained(database, 'officer', { role: 'FOH_MANAGER' })
      const member = trained(database, 'member', grant)

      const input = { performanceId: tonight.performanceId, role: 'DUTY_MANAGER' as const, slot: 1, userId: member }
      expect(run(database, addShiftStatement('shift-added', input, officer, OFFSETS, dutyManagerGate))).toHaveLength(written)
    })
  })
})

describe('a confirmed duty manager shift opens nothing without a live committee role (E-111 criterion 1)', () => {
  const bounds = showNightBounds(currentShowNight())
  const from = Math.floor(bounds.from.getTime() / 1000)
  const to = Math.floor(bounds.to.getTime() / 1000)

  function confirmed(database: TestDatabase, performanceId: string, role: string, userId: string): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
      `${performanceId}-${role}`, performanceId, role, userId, 'CONFIRMED']])
  }

  test.each(STANDINGS)('a holder with %s', async (_, grant, resolved) => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const holder = trained(database, 'holder', grant)
      confirmed(database, tonight.performanceId, 'DUTY_MANAGER', holder)

      expect(run(database, confirmedShiftsTonightQuery(holder, 'DUTY_MANAGER', from, to, {}, NOW))).toHaveLength(resolved)
    })
  })

  test('a door shift still resolves for somebody with no committee role', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const holder = trained(database, 'door-holder')
      confirmed(database, tonight.performanceId, 'DOOR', holder)

      expect(run(database, confirmedShiftsTonightQuery(holder, 'DOOR', from, to, {}, NOW))).toHaveLength(1)
    })
  })

  // What the refusal asks: the shift is there and only the role is missing, so it can say so.
  test('asked to look past the committee role, the shift is found, so the refusal can name what is missing', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const holder = trained(database, 'former')
      confirmed(database, tonight.performanceId, 'DUTY_MANAGER', holder)

      expect(run(database, confirmedShiftsTonightQuery(holder, 'DUTY_MANAGER', from, to, { anyStanding: true }, NOW))).toHaveLength(1)
    })
  })
})
