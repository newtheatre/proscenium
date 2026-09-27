import { describe, expect, test } from 'bun:test'
import { barSetUpQuery, waitingCountsQuery } from '#server/utils/console-overview'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// The overview's counts and set-up facts against the real migrations (issue 1358). A count is the
// waiting set each queue's own screen opens on, so the sidebar, the overview and the list agree.

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

function person(database: TestDatabase, id: string, anonymised = false): void {
  database.batch([['INSERT INTO users (id, email, name, anonymised_at) VALUES (?, ?, ?, ?)', id, `${id}@example.invalid`, `Someone ${id}`, anonymised ? 1_780_000_000 : null]])
}

function claim(database: TestDatabase, id: string, userId: string, status: string): void {
  database.batch([['INSERT INTO membership_claims (id, user_id, student_id, starts_on, term, status) VALUES (?, ?, ?, ?, ?, ?)', id, userId, `S${id}`, '2026-09-01', 1, status]])
}

function seedQueues(database: TestDatabase): void {
  for (const id of ['u-1', 'u-2', 'u-3', 'lead']) person(database, id)
  person(database, 'u-erased', true)

  // Two waiting claims, one decided and one on an erased account, which the register never shows.
  claim(database, 'c-1', 'u-1', 'OPEN')
  claim(database, 'c-2', 'u-2', 'OPEN')
  claim(database, 'c-3', 'u-3', 'RECORDED')
  claim(database, 'c-4', 'u-erased', 'OPEN')

  database.batch([
    ['INSERT INTO access_profiles (user_id, status, created_at) VALUES (?, ?, ?)', 'u-1', 'PENDING', 100],
    ['INSERT INTO access_profiles (user_id, status, created_at) VALUES (?, ?, ?)', 'u-2', 'VERIFIED', 200],

    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-1', 'Studio'],
    ['INSERT INTO room_bookings (id, room_id, user_id, title, tier, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'b-1', 'r-1', 'u-1', 'Line run', 'REHEARSAL', 'PENDING_APPROVAL', 2_000, 3_000],
    ['INSERT INTO room_bookings (id, room_id, user_id, title, tier, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'b-2', 'r-1', 'u-2', 'Dance call', 'GENERAL', 'CONFIRMED', 4_000, 5_000],
    ['INSERT INTO external_requests (id, user_id, title, purpose, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)', 'x-1', 'u-1', 'A read-through', 'rehearsal', 100, 200, 'REQUESTED'],
    ['INSERT INTO external_requests (id, user_id, title, purpose, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)', 'x-2', 'u-2', 'A get-in', 'rehearsal', 100, 200, 'AWAITING_EXTERNAL'],
    ['INSERT INTO external_requests (id, user_id, title, purpose, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)', 'x-3', 'u-3', 'A workshop', 'rehearsal', 100, 200, 'REJECTED'],

    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'dept-a', 'Lighting'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'dept-b', 'Sound'],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'mod-a', 'dept-a', 'MODULE', 'Working at height'],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'mod-b', 'dept-b', 'MODULE', 'Mixing desk'],
    ['INSERT INTO department_leads (id, department, user_id) VALUES (?, ?, ?)', 'dl-1', 'dept-a', 'lead'],
    ['INSERT INTO module_requests (id, user_id, module_id, status) VALUES (?, ?, ?, ?)', 'mr-1', 'u-1', 'mod-a', 'OPEN'],
    ['INSERT INTO module_requests (id, user_id, module_id, status) VALUES (?, ?, ?, ?)', 'mr-2', 'u-2', 'mod-b', 'OPEN'],
    ['INSERT INTO module_requests (id, user_id, module_id, status) VALUES (?, ?, ?, ?)', 'mr-3', 'u-3', 'mod-a', 'WITHDRAWN'],

    ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)', 'pt-1', 'season', 'Season pass', 1_000, 2_000],
    ['INSERT INTO pass_requests (id, pass_type_id, user_id, status) VALUES (?, ?, ?, ?)', 'pr-1', 'pt-1', 'u-1', 'PENDING'],
    ['INSERT INTO pass_requests (id, pass_type_id, user_id, status) VALUES (?, ?, ?, ?)', 'pr-2', 'pt-1', 'u-2', 'DECLINED'],
  ])
}

describe('what is waiting, counted as each queue opens (issue 1358)', () => {
  test('every queue counts its waiting set and nothing already decided', async () => {
    await withDatabase((database) => {
      seedQueues(database)
      const [counts] = read<Record<string, number>>(database, waitingCountsQuery(['membership-claims', 'access-profiles', 'room-requests', 'training-requests', 'pass-requests'], undefined))
      expect(counts).toEqual({
        'membership-claims': 2,
        'access-profiles': 1,
        // One of our rooms waiting, and two unlisted requests still open.
        'room-requests': 3,
        'training-requests': 2,
        'pass-requests': 1,
      })
    })
  })

  test('only the queues asked for are counted', async () => {
    await withDatabase((database) => {
      seedQueues(database)
      const [counts] = read<Record<string, number>>(database, waitingCountsQuery(['pass-requests'], undefined))
      expect(counts).toEqual({ 'pass-requests': 1 })
    })
  })

  // G-110: a lead answers the requests for the departments they steward, and no other.
  test('a department lead counts only their own departments\' requests', async () => {
    await withDatabase((database) => {
      seedQueues(database)
      const [counts] = read<Record<string, number>>(database, waitingCountsQuery(['training-requests'], 'lead'))
      expect(counts).toEqual({ 'training-requests': 1 })
    })
  })
})

interface BarSetUp { anythingOnHand: number, anyStocktake: number, allergensUnknown: number }

describe('the bar\'s set-up still to do (issue 1358)', () => {
  test('an empty bar has nothing on hand, no stocktake and no product waiting on allergens', async () => {
    await withDatabase((database) => {
      const [facts] = read<BarSetUp>(database, barSetUpQuery())
      expect(facts).toEqual({ anythingOnHand: 0, anyStocktake: 0, allergensUnknown: 0 })
    })
  })

  test('a delivery puts something on hand, and a sale that took it all leaves nothing', async () => {
    await withDatabase((database) => {
      database.batch([
        ['INSERT INTO bar_items (id, name, unit) VALUES (?, ?, ?)', 'i-1', 'Lager', 'ITEM'],
        ['INSERT INTO stock_movements (id, item_id, qty, kind) VALUES (?, ?, ?, ?)', 'm-1', 'i-1', 24, 'DELIVERY'],
      ])
      expect(read<BarSetUp>(database, barSetUpQuery())[0]?.anythingOnHand).toBe(1)
      database.batch([['INSERT INTO stock_movements (id, item_id, qty, kind) VALUES (?, ?, ?, ?)', 'm-2', 'i-1', -24, 'SALE']])
      expect(read<BarSetUp>(database, barSetUpQuery())[0]?.anythingOnHand).toBe(0)
    })
  })

  test('only an applied stocktake counts, and a retired product is not waiting on allergens', async () => {
    await withDatabase((database) => {
      person(database, 'counter')
      database.batch([
        ['INSERT INTO stocktakes (id, status, opened_by) VALUES (?, \'OPEN\', ?)', 's-1', 'counter'],
        ['INSERT INTO bar_categories (id, name) VALUES (?, ?)', 'cat-1', 'Beer'],
        ['INSERT INTO bar_products (id, category_id, name) VALUES (?, ?, ?)', 'p-1', 'cat-1', 'Lager'],
        ['INSERT INTO bar_products (id, category_id, name, status) VALUES (?, ?, ?, ?)', 'p-2', 'cat-1', 'Old cider', 'RETIRED'],
        ['INSERT INTO bar_products (id, category_id, name, allergen_state) VALUES (?, ?, ?, ?)', 'p-3', 'cat-1', 'Crisps', 'NONE'],
      ])
      expect(read<BarSetUp>(database, barSetUpQuery())[0]).toMatchObject({ anyStocktake: 0, allergensUnknown: 1 })
      database.batch([['UPDATE stocktakes SET status = \'APPLIED\', applied_by = ?, applied_at = opened_at WHERE id = ?', 'counter', 's-1']])
      expect(read<BarSetUp>(database, barSetUpQuery())[0]?.anyStocktake).toBe(1)
    })
  })
})
