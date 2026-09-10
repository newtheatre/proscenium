import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { seed } from '../../scripts/seed/index'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { SeedResult } from '../../scripts/seed/index'
import type { TestDatabase } from '#tests/helpers/database'

// The seed is what a developer sees before any of them opens a screen, so what it covers is a
// contract rather than a convenience (K-120). A table falling out of it is a silent regression.

// Not scrypt: this suite is about what the seed writes, and hashing thirty accounts properly
// costs seconds for a value nothing here reads.
const hash = (password: string): Promise<string> => Promise.resolve(`stub:${password}`)

let database: TestDatabase
let result: SeedResult

beforeAll(async () => {
  database = await createTestDatabase()
  result = await seed(database, { hash, password: () => crypto.randomUUID(), token: () => crypto.randomUUID() })
}, 120_000)

afterAll(() => {
  database?.close()
})

function counts(table: string): number {
  return rows<{ n: number }>(database, `SELECT count(*) AS n FROM ${table}`)[0]!.n
}

describe('the seed fills the screens', () => {
  // The (source, tender, kind) triples fixed in architecture.md's money-path table. A path with
  // no seeded entry is a money screen a developer cannot look at (0004).
  const TRIPLES: [string, string, string][] = [
    ['DESK', 'CARD', 'TICKET_COLLECTION'],
    ['DESK', 'COMP', 'TICKET_COLLECTION'],
    ['DESK', 'CARD', 'WALK_UP'],
    ['DESK', 'COMP', 'WALK_UP'],
    ['DESK', 'CARD', 'REFUND'],
    ['DESK', 'CARD', 'PASS_SALE'],
    ['DESK', 'NONE', 'PASS_ADMISSION'],
    ['SELF_SERVE', 'NONE', 'PASS_ADMISSION'],
    ['TILL', 'CARD', 'BAR_ITEM'],
    ['TILL', 'COMP', 'BAR_ITEM'],
    ['TILL', 'TAB', 'BAR_ITEM'],
    ['TILL', 'CARD', 'TAB_SETTLEMENT'],
    ['IMPORT', 'CARD', 'IMPORT'],
    ['IMPORT', 'NONE', 'IMPORT'],
  ]

  test('every money path in architecture.md has an entry', () => {
    const seeded = rows<{ source: string, tender: string, kind: string }>(
      database,
      `SELECT DISTINCT e.source, e.tender, l.kind FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id`,
    ).map(row => `${row.source}/${row.tender}/${row.kind}`)

    for (const [source, tender, kind] of TRIPLES) {
      expect(seeded).toContain(`${source}/${tender}/${kind}`)
    }
  })

  test('a correction carries a negative amount and names what it corrects', () => {
    const corrections = rows<{ id: string, total: number }>(
      database,
      `SELECT id, total_pence AS total FROM ledger_entries WHERE reverses_entry_id IS NOT NULL`,
    )
    expect(corrections.length).toBeGreaterThan(0)
    for (const correction of corrections) expect(correction.total).toBeLessThan(0)
  })

  test('every reservation status exists', () => {
    const seeded = rows<{ status: string }>(database, 'SELECT DISTINCT status FROM reservations').map(row => row.status)
    for (const status of ['PENDING', 'COLLECTED', 'DOOR', 'EXPIRED', 'CANCELLED', 'NO_SHOW']) {
      expect(seeded).toContain(status)
    }
  })

  test('every shift status exists', () => {
    const seeded = rows<{ status: string }>(database, 'SELECT DISTINCT status FROM shifts').map(row => row.status)
    for (const status of ['OPEN', 'CLAIMED', 'CONFIRMED', 'DECLINED', 'CANCELLED']) {
      expect(seeded).toContain(status)
    }
  })

  test('performances land in the past, tonight and the future', () => {
    const [span] = rows<{ past: number, ahead: number }>(database, `
      SELECT sum(starts_at < unixepoch()) AS past, sum(starts_at >= unixepoch()) AS ahead FROM performances
    `)
    expect(span!.past).toBeGreaterThan(0)
    expect(span!.ahead).toBeGreaterThan(0)
    expect(counts(`performances WHERE status = 'CANCELLED'`)).toBeGreaterThan(0)
    expect(counts(`performances WHERE status = 'DRAFT'`)).toBeGreaterThan(0)
    expect(counts('performances WHERE external_booking_url IS NOT NULL')).toBeGreaterThan(0)
  })

  test('one performance is sold out and another is empty', () => {
    const seats = rows<{ id: string, capacity: number, sold: number }>(database, `
      SELECT p.id, p.capacity_override AS capacity, count(t.id) AS sold
      FROM performances p
      LEFT JOIN tickets t ON t.performance_id = p.id AND t.refunded_at IS NULL
      WHERE p.capacity_override IS NOT NULL
      GROUP BY p.id
    `)
    expect(seats.some(row => row.sold >= row.capacity)).toBe(true)
    expect(seats.some(row => row.sold === 0)).toBe(true)
  })

  test('roles and training records cover current, expiring and lapsed', () => {
    expect(counts('role_grants WHERE expires_at IS NULL')).toBeGreaterThan(0)
    expect(counts('role_grants WHERE expires_at < unixepoch()')).toBeGreaterThan(0)
    expect(counts(`role_grants WHERE expires_at BETWEEN unixepoch() AND unixepoch() + 30 * 86400`)).toBeGreaterThan(0)

    expect(counts('training_records WHERE expires_on IS NULL')).toBeGreaterThan(0)
    expect(counts(`training_records WHERE expires_on < date('now')`)).toBeGreaterThan(0)
    expect(counts('training_records WHERE revoked_at IS NOT NULL')).toBeGreaterThan(0)
  })

  test('membership covers current, lapsed, unconfirmed and none', () => {
    expect(counts(`memberships WHERE expires_on > date('now') AND confirmed_at IS NOT NULL`)).toBeGreaterThan(0)
    expect(counts(`memberships WHERE expires_on < date('now')`)).toBeGreaterThan(0)
    expect(counts('memberships WHERE confirmed_at IS NULL')).toBeGreaterThan(0)
    expect(counts('users WHERE id NOT IN (SELECT user_id FROM memberships)')).toBeGreaterThan(0)
  })

  test('the awkward account states exist', () => {
    expect(counts('users WHERE password IS NULL AND anonymised_at IS NULL')).toBeGreaterThan(0)
    expect(counts('users WHERE anonymised_at IS NOT NULL')).toBeGreaterThan(0)
    expect(counts('users WHERE disabled = 1')).toBeGreaterThan(0)
    expect(counts('users WHERE verified = 0')).toBeGreaterThan(0)
  })

  test('a show night has incidents, age checks and a part-finished checklist', () => {
    expect(counts('incidents')).toBeGreaterThan(0)
    expect(counts('incidents WHERE supersedes_id IS NOT NULL')).toBeGreaterThan(0)
    expect(counts('incident_followup_closures')).toBeGreaterThan(0)
    expect(counts(`age_checks WHERE outcome = 'ACCEPTED'`)).toBeGreaterThan(0)
    expect(counts(`age_checks WHERE outcome = 'REFUSED'`)).toBeGreaterThan(0)
    expect(counts('checklist_stamps WHERE ticked_at IS NOT NULL')).toBeGreaterThan(0)
    expect(counts('checklist_stamps WHERE exempted = 1')).toBeGreaterThan(0)
    expect(counts('checklist_closes')).toBeGreaterThan(0)
  })

  test('the bar has a catalogue, stock that has moved and a settled tab', () => {
    expect(counts('bar_categories')).toBeGreaterThan(3)
    expect(counts('product_variants')).toBeGreaterThan(15)
    expect(counts(`stock_movements WHERE kind = 'DELIVERY'`)).toBeGreaterThan(0)
    expect(counts(`stock_movements WHERE kind = 'WASTAGE'`)).toBeGreaterThan(0)
    expect(counts(`stock_movements WHERE kind = 'REVERSAL'`)).toBeGreaterThan(0)
    expect(counts(`stocktakes WHERE status = 'OPEN'`)).toBe(1)
    expect(counts(`stocktakes WHERE status = 'APPLIED'`)).toBeGreaterThan(0)
    expect(counts('till_sessions WHERE closed_at IS NULL')).toBeGreaterThan(0)
    expect(counts('till_sessions WHERE closed_at IS NOT NULL')).toBeGreaterThan(0)
    expect(counts(`comp_requests WHERE status = 'PENDING'`)).toBeGreaterThan(0)
    expect(counts(`comp_requests WHERE status = 'APPROVED'`)).toBeGreaterThan(0)
    expect(counts(`comp_requests WHERE status = 'DECLINED'`)).toBeGreaterThan(0)
  })

  test('it commits no credential and prints every one it made', () => {
    expect(result.secrets.accounts.length).toBeGreaterThan(0)
    for (const account of result.secrets.accounts) expect(account.password).toBeTruthy()
    expect(result.secrets.boardTokens.length).toBeGreaterThan(0)
    expect(result.secrets.feedTokens.length).toBeGreaterThan(0)

    // Every generated password is unique to the run, so nothing here is a constant somebody could
    // have committed (K-120 criterion 1).
    const distinct = new Set(result.secrets.accounts.map(account => account.password))
    expect(distinct.size).toBe(result.secrets.accounts.length)
  })

  test('a second run changes nothing but the password it prints', async () => {
    const tables = rows<{ name: string }>(
      database,
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    ).map(row => row.name)
    const before = Object.fromEntries(tables.map(table => [table, counts(table)]))

    await seed(database, { hash, password: () => crypto.randomUUID(), token: () => crypto.randomUUID() })

    const after = Object.fromEntries(tables.map(table => [table, counts(table)]))
    expect(after).toEqual(before)
  }, 120_000)
})
