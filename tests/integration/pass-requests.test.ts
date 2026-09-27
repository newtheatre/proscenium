import { describe, expect, test } from 'bun:test'
import { requestPassStatement, withdrawPassRequestStatement } from '#server/utils/pass-issue'
import { expectOneWinner, race } from '#tests/helpers/race'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Issue 1331 on the real migrations: one open request per account and pass type, none for a pass
// already held, and a withdrawal that takes back only the member's own open request (D-124 c3).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-officer', 'officer@example.invalid', 'Officer'],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-1', 'one@example.invalid', 'One'],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-2', 'two@example.invalid', 'Two'],
      ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?)',
        'pt-1', 'season-pass', 'Season pass', 1_000, 2_000, 'ON_SALE'],
      ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?)',
        'pt-2', 'term-pass', 'Term pass', 1_000, 2_000, 'ON_SALE'],
      ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-1', 'pt-1', 'Standard', 4500],
    ])
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, built: SQL): number {
  const [query, ...parameters] = boundStatement(database, built)
  return database.raw.prepare(query).all(...parameters as never[]).length
}

function openRequests(database: TestDatabase, userId: string, passTypeId: string): number {
  return rows<{ total: number }>(database,
    'SELECT count(*) AS total FROM pass_requests WHERE user_id = ? AND pass_type_id = ? AND status = \'PENDING\'',
    userId, passTypeId)[0]?.total ?? 0
}

describe('one open request per account and pass type (issue 1331, D-124 criterion 3)', () => {
  test('a first request is written', async () => {
    await withDatabase((database) => {
      expect(run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))).toBe(1)
      expect(openRequests(database, 'u-1', 'pt-1')).toBe(1)
    })
  })

  test('a second request while the first is open writes nothing', async () => {
    await withDatabase((database) => {
      run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))
      expect(run(database, requestPassStatement('r-2', 'pt-1', 'u-1'))).toBe(0)
      expect(openRequests(database, 'u-1', 'pt-1')).toBe(1)
    })
  })

  // The index is the refusal, not a read taken first, so a hand-written row is refused as well.
  test('the database itself refuses a second open row, whatever writes it', async () => {
    await withDatabase((database) => {
      run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))
      expect(() => database.batch([
        ['INSERT INTO pass_requests (id, pass_type_id, user_id, status) VALUES (?, ?, ?, ?)', 'r-2', 'pt-1', 'u-1', 'PENDING'],
      ])).toThrow()
    })
  })

  test('another member, or another pass type, is unaffected', async () => {
    await withDatabase((database) => {
      run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))
      expect(run(database, requestPassStatement('r-2', 'pt-1', 'u-2'))).toBe(1)
      expect(run(database, requestPassStatement('r-3', 'pt-2', 'u-1'))).toBe(1)
    })
  })

  test('once a request has lapsed, asking again is allowed', async () => {
    await withDatabase((database) => {
      run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))
      database.batch([['UPDATE pass_requests SET status = \'EXPIRED\' WHERE id = ?', 'r-1']])
      expect(run(database, requestPassStatement('r-2', 'pt-1', 'u-1'))).toBe(1)
    })
  })

  test('two racing requests for the same pass leave exactly one open', async () => {
    await withDatabase(async (database) => {
      const answers = await race(2, async index => ({
        status: run(database, requestPassStatement(`r-${index}`, 'pt-1', 'u-1')) === 1 ? 200 : 409,
      }))
      expectOneWinner(answers)
      expect(openRequests(database, 'u-1', 'pt-1')).toBe(1)
    })
  })
})

describe('no request for a pass already held (issue 1331)', () => {
  test('an active pass of the type refuses the request; another type is still open to ask for', async () => {
    await withDatabase((database) => {
      database.batch([
        [`INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 'p-1', 'ABC123', 'pt-1', 'price-1', 'u-1', 4500, 'ACTIVE', 'u-officer'],
      ])
      expect(run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))).toBe(0)
      expect(run(database, requestPassStatement('r-2', 'pt-2', 'u-1'))).toBe(1)
    })
  })
})

describe('a member withdraws their own open request, and nothing else (issue 1331)', () => {
  test('an open request of their own is taken back, and asking again is then allowed', async () => {
    await withDatabase((database) => {
      run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))
      expect(run(database, withdrawPassRequestStatement('r-1', 'u-1'))).toBe(1)
      expect(openRequests(database, 'u-1', 'pt-1')).toBe(0)
      expect(run(database, requestPassStatement('r-2', 'pt-1', 'u-1'))).toBe(1)
    })
  })

  test('somebody else\'s request is not theirs to withdraw', async () => {
    await withDatabase((database) => {
      run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))
      expect(run(database, withdrawPassRequestStatement('r-1', 'u-2'))).toBe(0)
      expect(openRequests(database, 'u-1', 'pt-1')).toBe(1)
    })
  })

  test('a request already fulfilled at the desk cannot be withdrawn', async () => {
    await withDatabase((database) => {
      run(database, requestPassStatement('r-1', 'pt-1', 'u-1'))
      database.batch([
        [`INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 'p-1', 'ABC123', 'pt-1', 'price-1', 'u-1', 4500, 'ACTIVE', 'u-officer'],
        ['UPDATE pass_requests SET status = \'FULFILLED\', pass_id = ? WHERE id = ?', 'p-1', 'r-1'],
      ])
      expect(run(database, withdrawPassRequestStatement('r-1', 'u-1'))).toBe(0)
      expect(rows<{ status: string }>(database, 'SELECT status FROM pass_requests WHERE id = ?', 'r-1')[0]?.status).toBe('FULFILLED')
    })
  })
})
