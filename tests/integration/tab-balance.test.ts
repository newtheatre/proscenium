import { describe, expect, test } from 'bun:test'
import { tabBalanceQuery, unsettledTabsQuery } from '#server/utils/tab-settlement'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// F-109 criteria 1 and 6: what a holder still owes, run against the real migrations rather than
// assumed from the shape of the SQL. A void credits the charge; neither side may linger.

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

function people(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-member', 'member@example.invalid', 'Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-staff', 'staff@example.invalid', 'Staff'],
  ])
}

let seq = 0

function charge(database: TestDatabase, totalPence: number): string {
  const id = `charge-${++seq}`
  database.batch([
    [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
      VALUES (?, ?, '2026-09-09', 'TILL', 'TAB', 'u-staff', ?, 'u-member')`, id, 1_788_950_000 + seq, totalPence],
    [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence)
      VALUES (?, ?, 'BAR_ITEM', ?, 1, ?)`, `${id}-line`, id, totalPence, totalPence],
  ])
  return id
}

// The shape `voidTabCharge` posts: a credit entry naming the charge it voids, carrying the same
// holder, so the sum nets even before the exclusion clause is reached.
function voidOf(database: TestDatabase, entryId: string, totalPence: number): string {
  const id = `void-${++seq}`
  database.batch([
    [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id, void_of_entry_id, void_reason)
      VALUES (?, ?, '2026-09-09', 'TILL', 'TAB', 'u-staff', ?, 'u-member', ?, 'Charged in error')`, id, 1_788_950_000 + seq, -totalPence, entryId],
    [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence)
      VALUES (?, ?, 'BAR_ITEM', ?, 1, ?)`, `${id}-line`, id, -totalPence, -totalPence],
  ])
  return id
}

function settle(database: TestDatabase, entryId: string, totalPence: number): void {
  const id = `settlement-${++seq}`
  database.batch([
    [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
      VALUES (?, ?, '2026-09-09', 'TILL', 'CARD', 'u-staff', ?)`, id, 1_788_950_000 + seq, totalPence],
    [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence, settles_entry_id)
      VALUES (?, ?, 'TAB_SETTLEMENT', ?, 1, ?, ?)`, `${id}-line`, id, totalPence, totalPence, entryId],
  ])
}

const balanceOf = (database: TestDatabase): number =>
  read<{ total: number }>(database, tabBalanceQuery('u-member'))[0]?.total ?? 0

const yearEnd = (database: TestDatabase): { holderId: string, outstandingPence: number }[] =>
  read<{ holderId: string, outstandingPence: number }>(database, unsettledTabsQuery())
    .map(row => ({ holderId: row.holderId, outstandingPence: row.outstandingPence }))

describe('a voided tab charge leaves the holder\'s balance (F-109 criteria 1, 6)', () => {
  test('an outstanding charge counts, and its holder is on the year-end list', async () => {
    await withDatabase((database) => {
      people(database)
      charge(database, 500)

      expect(balanceOf(database)).toBe(500)
      expect(yearEnd(database)).toEqual([{ holderId: 'u-member', outstandingPence: 500 }])
    })
  })

  test('voiding the only charge takes the balance to zero', async () => {
    await withDatabase((database) => {
      people(database)
      voidOf(database, charge(database, 500), 500)

      expect(balanceOf(database)).toBe(0)
    })
  })

  test('the holder drops off the year-end list once their charges are voided', async () => {
    await withDatabase((database) => {
      people(database)
      voidOf(database, charge(database, 500), 500)

      expect(yearEnd(database)).toEqual([])
    })
  })

  test('a void leaves the holder room under the cap for the whole amount again', async () => {
    await withDatabase((database) => {
      people(database)
      voidOf(database, charge(database, 2000), 2000)
      charge(database, 2000)

      // The cap reads this sum, so a holder voided back to nothing may charge the full cap again
      // rather than the fraction a phantom balance would leave them (F-108 criterion 3).
      expect(balanceOf(database)).toBe(2000)
    })
  })

  test('a settled charge is out of the sum and a later charge is in', async () => {
    await withDatabase((database) => {
      people(database)
      settle(database, charge(database, 500), 500)
      charge(database, 300)

      expect(balanceOf(database)).toBe(300)
      expect(yearEnd(database)).toEqual([{ holderId: 'u-member', outstandingPence: 300 }])
    })
  })

  test('one voided charge does not hide another that is still owed', async () => {
    await withDatabase((database) => {
      people(database)
      voidOf(database, charge(database, 500), 500)
      charge(database, 700)

      expect(balanceOf(database)).toBe(700)
      expect(yearEnd(database)).toEqual([{ holderId: 'u-member', outstandingPence: 700 }])
    })
  })
})
