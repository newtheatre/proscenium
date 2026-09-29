import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { voidGuard, voidTabCharge } from '#server/utils/tab-settlement'
import { OWN_TAB_VOID } from '#shared/utils/self-dealing'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { bindD1 } from '#tests/helpers/d1'
import type { TestDatabase } from '#tests/helpers/database'

// F-109 criterion 4, 0115: nobody voids a charge on their own tab. The void entry's own guard
// refuses it, so the rule holds for any caller of the write, not only the route that reads first.

let database: TestDatabase

beforeEach(async () => {
  database = await createTestDatabase()
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-officer', 'officer@example.invalid', 'An officer'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-member', 'member@example.invalid', 'A member'],
  ])
  bindD1(database)
})

afterEach(() => {
  database.close()
})

let seq = 0

function charge(holderId: string): string {
  const id = `charge-${++seq}`
  database.batch([
    [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
      VALUES (?, ?, '2026-09-09', 'TILL', 'TAB', 'u-member', 500, ?)`, id, 1_788_950_000 + seq, holderId],
    [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence)
      VALUES (?, ?, 'BAR_ITEM', 500, 1, 500)`, `${id}-line`, id],
  ])
  return id
}

const voidsOf = (entryId: string): unknown[] =>
  rows(database, 'SELECT id FROM ledger_entries WHERE void_of_entry_id = ?', entryId)

const voidAudits = (entryId: string): unknown[] =>
  rows(database, `SELECT id FROM audit_log WHERE action = 'bar.tab-charge.voided' AND target = ?`, `ledger-entry:${entryId}`)

describe('a void is never made on the voider\'s own tab (F-109 criterion 4, 0115)', () => {
  test('voiding a charge on one\'s own tab is refused, naming who can, and posts nothing', async () => {
    const own = charge('u-officer')

    await expect(voidTabCharge(own, 'Charged in error', 'u-officer'))
      .rejects.toMatchObject({ statusCode: 403, statusMessage: OWN_TAB_VOID })

    expect(voidsOf(own)).toEqual([])
    expect(voidAudits(own)).toEqual([])
  })

  test('the same officer voids a charge on somebody else\'s tab', async () => {
    const theirs = charge('u-member')

    await voidTabCharge(theirs, 'Charged in error', 'u-officer')

    expect(voidsOf(theirs)).toHaveLength(1)
    expect(voidAudits(theirs)).toHaveLength(1)
  })

  test('the guard on the void\'s own insert refuses the holder, whatever was read before it', () => {
    const own = charge('u-officer')
    const insertVoid = (actorId: string): number => {
      const [guard, ...parameters] = boundStatement(database, voidGuard(own, actorId))
      return rows(database, `
        INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id, void_of_entry_id, void_reason)
        SELECT ?, 1788960000, '2026-09-09', 'TILL', 'TAB', ?, -500, 'u-officer', ?, 'Charged in error'
        WHERE ${guard}
        RETURNING id
      `, `void-by-${actorId}`, actorId, own, ...parameters).length
    }

    expect(insertVoid('u-officer')).toBe(0)
    expect(insertVoid('u-member')).toBe(1)
  })

  test('the guard still refuses a charge settled since it was read (criterion 4)', () => {
    const theirs = charge('u-member')
    database.batch([
      [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
        VALUES ('settlement-1', 1788960000, '2026-09-09', 'TILL', 'CARD', 'u-officer', 500)`],
      [`INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence, settles_entry_id)
        VALUES ('settlement-1-line', 'settlement-1', 'TAB_SETTLEMENT', 500, 1, 500, ?)`, theirs],
    ])

    const [guard, ...parameters] = boundStatement(database, voidGuard(theirs, 'u-officer'))
    expect(rows(database, `SELECT 1 AS ok WHERE ${guard}`, ...parameters)).toEqual([])
  })
})
