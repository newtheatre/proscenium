import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { tabCapGuard } from '#server/utils/tab-settlement'
import { ownTabCapOverride } from '#shared/utils/self-dealing'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// F-108 criterion 4, 0116: an override lifts the cap only when someone other than the holder makes
// it. The guard rides the charge's own insert, so the till's refusal is for the reader alone.

const CAP = 2000
let database: TestDatabase

beforeEach(async () => {
  database = await createTestDatabase()
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-manager', 'manager@example.invalid', 'A duty manager'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-member', 'member@example.invalid', 'A member'],
    [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
      VALUES ('manager-owes', 1788950000, '2026-09-09', 'TILL', 'TAB', 'u-member', 1800, 'u-manager')`],
    [`INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
      VALUES ('member-owes', 1788950001, '2026-09-09', 'TILL', 'TAB', 'u-manager', 1800, 'u-member')`],
  ])
})

afterEach(() => {
  database.close()
})

// The shape `postEntry`'s guarded branch writes, charged by `actorId` to `holderId`'s tab.
function charge(id: string, holderId: string, actorId: string, overriddenBy: string | null): number {
  const [guard, ...parameters] = boundStatement(database, tabCapGuard(holderId, 500, CAP, overriddenBy))
  return rows<{ id: string }>(database, `
    INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence, tab_debtor_id)
    SELECT ?, 1788950100, '2026-09-09', 'TILL', 'TAB', ?, 500, ?
    WHERE ${guard}
    RETURNING id
  `, id, actorId, holderId, ...parameters).length
}

describe('nobody overrides the cap on their own tab (F-108 criterion 4, 0116)', () => {
  test('a manager\'s override past the cap on their own tab writes nothing', () => {
    expect(charge('own-override', 'u-manager', 'u-manager', 'u-manager')).toBe(0)
    expect(rows(database, 'SELECT id FROM ledger_entries WHERE id = ?', 'own-override')).toEqual([])
  })

  test('the same manager\'s override past the cap on somebody else\'s tab is written', () => {
    expect(charge('their-override', 'u-member', 'u-manager', 'u-manager')).toBe(1)
  })

  test('with no override, the cap holds for every holder', () => {
    expect(charge('no-override', 'u-member', 'u-manager', null)).toBe(0)
  })

  test('a charge within the cap needs no override, on one\'s own tab too', () => {
    database.batch([['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-clear', 'clear@example.invalid', 'Owes nothing']])
    expect(charge('own-within', 'u-clear', 'u-clear', null)).toBe(1)
  })

  test('the till\'s refusal quotes the balance, the charge and the cap, and names who can', () => {
    expect(ownTabCapOverride('A duty manager', 1800, 500, CAP)).toBe(
      'A duty manager\'s tab is at £18.00; this charge of £5.00 would take it past the £20.00 cap. '
      + 'Nothing has been charged: nobody overrides the cap on their own tab, so tonight\'s duty manager '
      + 'or someone else holding the Front of House Manager\'s role puts it through.',
    )
  })
})
