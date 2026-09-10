import { describe, expect, test } from 'bun:test'
import {
  claimEntryStatement,
  expiredOffersQuery,
  joinEntryStatement,
  lapseOfferStatement,
  nextWaitingEntriesQuery,
  offerEntryStatement,
  purgeCandidatesQuery,
  removeEntryStatement,
} from '#server/utils/waiting-list'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// D-113 against the real migrations. `offerWaitingList`, `claimWaitingListOffer` and friends read
// live config and the real `db` binding, so what is tested here is the statement each one runs:
// the same split tests/integration/holds.test.ts uses for D-106.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
    database.batch([
      ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-1', 'one@example.invalid', 'One'],
      ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-2', 'two@example.invalid', 'Two'],
    ])
    await fn(database)
  }
  finally {
    database.close()
  }
}

function statement(database: TestDatabase, built: ReturnType<typeof joinEntryStatement>): { changes: number, rows: unknown[] } {
  const [query, ...parameters] = boundStatement(database, built)
  const prepared = database.raw.prepare(query)
  const returned = prepared.all(...parameters as never[])
  return { changes: returned.length, rows: returned }
}

function join(database: TestDatabase, id: string, performanceId: string, userId: string, partySize = 1): number {
  return statement(database, joinEntryStatement(id, performanceId, userId, partySize)).changes
}

describe('joining refuses a second active entry for the same email and performance (criterion 1)', () => {
  test('a first join succeeds', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      expect(join(database, 'w-1', seeded.performanceId, 'u-1')).toBe(1)
    })
  })

  test('a second join while the first is still WAITING is refused', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      expect(join(database, 'w-2', seeded.performanceId, 'u-1')).toBe(0)
      expect(rows(database, 'SELECT count(*) AS n FROM waiting_list WHERE user_id = ?', 'u-1')[0]).toEqual({ n: 1 })
    })
  })

  test('a second join while the first is OFFERED is refused too', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      statement(database, offerEntryStatement('w-1', seeded.startsAt - 10_000, seeded.startsAt - 5_000))
      expect(join(database, 'w-2', seeded.performanceId, 'u-1')).toBe(0)
    })
  })

  test('joining again is allowed once the first entry is removed', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      statement(database, removeEntryStatement('w-1', seeded.startsAt - 10_000))
      expect(join(database, 'w-2', seeded.performanceId, 'u-1')).toBe(1)
    })
  })

  test('a different performance is unaffected', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { suffix: 'a' })
      const second = tonightsPerformance(database, { suffix: 'b' })
      join(database, 'w-1', first.performanceId, 'u-1')
      expect(join(database, 'w-2', second.performanceId, 'u-1')).toBe(1)
    })
  })
})

describe('the queue offers strictly in join order (criterion 2)', () => {
  test('oldest first, bound by cap', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO waiting_list (id, performance_id, user_id, party_size, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          'w-late', seeded.performanceId, 'u-1', 1, 'WAITING', 200],
        ['INSERT INTO waiting_list (id, performance_id, user_id, party_size, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          'w-early', seeded.performanceId, 'u-2', 1, 'WAITING', 100],
      ])
      const found = rows<{ id: string }>(database, ...boundStatement(database, nextWaitingEntriesQuery(seeded.performanceId, 10)))
      expect(found.map(row => row.id)).toEqual(['w-early', 'w-late'])
    })
  })

  test('offering moves WAITING to OFFERED exactly once', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      const first = statement(database, offerEntryStatement('w-1', seeded.startsAt - 10_000, seeded.startsAt - 5_000))
      expect(first.changes).toBe(1)
      const second = statement(database, offerEntryStatement('w-1', seeded.startsAt - 9_000, seeded.startsAt - 4_000))
      expect(second.changes).toBe(0)
      expect(rows(database, 'SELECT status FROM waiting_list WHERE id = ?', 'w-1')[0]).toEqual({ status: 'OFFERED' })
    })
  })
})

describe('an offer lapses past its own window, and only that one (criterion 3)', () => {
  test('an OFFERED entry past its expiry is eligible; one still open is not', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO waiting_list (id, performance_id, user_id, party_size, status, offered_at, offer_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          'w-lapsed', seeded.performanceId, 'u-1', 1, 'OFFERED', 100, 200],
        ['INSERT INTO waiting_list (id, performance_id, user_id, party_size, status, offered_at, offer_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          'w-open', seeded.performanceId, 'u-2', 1, 'OFFERED', 100, 9_999_999_999],
      ])
      const found = rows<{ id: string }>(database, ...boundStatement(database, expiredOffersQuery(300, 10)))
      expect(found.map(row => row.id)).toEqual(['w-lapsed'])

      expect(statement(database, lapseOfferStatement('w-lapsed')).changes).toBe(1)
      expect(rows(database, 'SELECT status FROM waiting_list WHERE id = ?', 'w-lapsed')[0]).toEqual({ status: 'LAPSED' })
    })
  })

  test('lapsing something not OFFERED writes nothing', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      expect(statement(database, lapseOfferStatement('w-1')).changes).toBe(0)
    })
  })
})

describe('a claim is race-safe: one freed ticket is never claimed twice (criterion 3)', () => {
  test('two concurrent claims on the same offer leave exactly one winner', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([[
        'INSERT INTO waiting_list (id, performance_id, user_id, party_size, status, offered_at, offer_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'w-1', seeded.performanceId, 'u-1', 1, 'OFFERED', seeded.startsAt - 10_000, seeded.startsAt - 5_000,
      ]])

      const first = statement(database, claimEntryStatement('w-1', seeded.startsAt - 6_000))
      const second = statement(database, claimEntryStatement('w-1', seeded.startsAt - 6_000))

      expect([first.changes, second.changes].sort()).toEqual([0, 1])
      expect(rows(database, 'SELECT status FROM waiting_list WHERE id = ?', 'w-1')[0]).toEqual({ status: 'CLAIMED' })
    })
  })

  test('a claim attempted after the offer window has passed wins nothing', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([[
        'INSERT INTO waiting_list (id, performance_id, user_id, party_size, status, offered_at, offer_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'w-1', seeded.performanceId, 'u-1', 1, 'OFFERED', seeded.startsAt - 10_000, seeded.startsAt - 5_000,
      ]])
      expect(statement(database, claimEntryStatement('w-1', seeded.startsAt - 4_000)).changes).toBe(0)
    })
  })
})

describe('removal is accepted at any time except once settled (criterion 4)', () => {
  test('a WAITING entry may be removed', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      expect(statement(database, removeEntryStatement('w-1', seeded.startsAt)).changes).toBe(1)
    })
  })

  test('an OFFERED entry may be removed too', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      statement(database, offerEntryStatement('w-1', seeded.startsAt - 10_000, seeded.startsAt - 5_000))
      expect(statement(database, removeEntryStatement('w-1', seeded.startsAt)).changes).toBe(1)
    })
  })

  test('a CLAIMED entry is not touched by a removal link opened again', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      statement(database, offerEntryStatement('w-1', seeded.startsAt - 10_000, seeded.startsAt - 5_000))
      statement(database, claimEntryStatement('w-1', seeded.startsAt - 6_000))
      expect(statement(database, removeEntryStatement('w-1', seeded.startsAt)).changes).toBe(0)
      expect(rows(database, 'SELECT status FROM waiting_list WHERE id = ?', 'w-1')[0]).toEqual({ status: 'CLAIMED' })
    })
  })
})

describe('purge candidates are performances at or past curtain (criterion 4)', () => {
  test('a performance still ahead is not a candidate', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      const found = rows(database, ...boundStatement(database, purgeCandidatesQuery(seeded.startsAt - 100_000, 10)))
      expect(found).toEqual([])
    })
  })

  test('a performance past curtain is a candidate, once per performance', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      join(database, 'w-1', seeded.performanceId, 'u-1')
      join(database, 'w-2', seeded.performanceId, 'u-2')
      const found = rows<{ performanceId: string }>(database, ...boundStatement(database, purgeCandidatesQuery(seeded.startsAt + 100_000, 10)))
      expect(found).toEqual([{ performanceId: seeded.performanceId }])
    })
  })
})
