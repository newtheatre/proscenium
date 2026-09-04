import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// 0048: a claim writes PENDING and notify() updates the same row, so a claimed send is one row.
// Mirrors the exact statements claimNotification and notify()'s record() run, as races.test.ts does.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seedUser(database: TestDatabase, id = 'u1'): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', id, `${id}@example.invalid`, 'A Member'],
  ])
}

// Exactly claimNotification()'s insert: the partial unique index refuses a second attempt at the
// same claim, so the caller never reads before writing (0006).
function claim(database: TestDatabase, key: string, userId = 'u1'): boolean {
  const taken = database.raw.prepare(
    `INSERT INTO notification_log (id, user_id, type, channel, status, claim)
     VALUES (?, ?, 'training.expiry.window', 'EMAIL', 'PENDING', ?)
     ON CONFLICT DO NOTHING RETURNING id`,
  ).all(`n-${Math.random().toString(36).slice(2, 10)}`, userId, key) as { id: string }[]
  return taken.length > 0
}

// Exactly notify()'s record() with a claim: an UPDATE matched on claim, never a second INSERT.
function resolve(database: TestDatabase, key: string, status: 'SENT' | 'FAILED' | 'SKIPPED_UNDELIVERABLE'): void {
  database.raw.prepare(`UPDATE notification_log SET status = ?, sent_at = ? WHERE claim = ?`)
    .run(status, status === 'SENT' ? 1 : null, key)
}

describe('a claim is spoken for before it is sent (0048)', () => {
  test('PENDING is a status the database accepts', async () => {
    await withDatabase((database) => {
      seedUser(database)
      expect(claim(database, 'k1')).toBe(true)
      expect(rows(database, `SELECT status FROM notification_log WHERE claim = 'k1'`)).toEqual([{ status: 'PENDING' }])
    })
  })

  test('a claim already taken as PENDING refuses a second attempt at the same claim', async () => {
    await withDatabase((database) => {
      seedUser(database)
      expect(claim(database, 'k1')).toBe(true)
      expect(claim(database, 'k1')).toBe(false)
      expect(rows(database, `SELECT id FROM notification_log WHERE claim = 'k1'`)).toHaveLength(1)
    })
  })

  test('a PENDING row updates to its outcome without a second row appearing', async () => {
    await withDatabase((database) => {
      seedUser(database)
      claim(database, 'k1')
      resolve(database, 'k1', 'SENT')
      expect(rows(database, `SELECT status FROM notification_log WHERE claim = 'k1'`)).toEqual([{ status: 'SENT' }])
      expect(rows(database, `SELECT id FROM notification_log WHERE claim = 'k1'`)).toHaveLength(1)
    })
  })
})

describe('server/utils/notify.ts, once claimNotification and notify() are updated (0048)', () => {
  test('claimNotification writes PENDING, not SENT', async () => {
    await withDatabase((database) => {
      seedUser(database)
      claim(database, 'k2')
      expect(rows(database, `SELECT status, sent_at FROM notification_log WHERE claim = 'k2'`))
        .toEqual([{ status: 'PENDING', sent_at: null }])
    })
  })

  test('notify() updates the claimed row rather than inserting a second one', async () => {
    await withDatabase((database) => {
      seedUser(database)
      claim(database, 'k3')
      resolve(database, 'k3', 'SENT')
      expect(rows(database, `SELECT id FROM notification_log`)).toHaveLength(1)
      expect(rows(database, `SELECT status, sent_at FROM notification_log WHERE claim = 'k3'`))
        .toEqual([{ status: 'SENT', sent_at: 1 }])
    })
  })

  test('a failed send on a claimed row leaves FAILED, never SENT beside it', async () => {
    await withDatabase((database) => {
      seedUser(database)
      claim(database, 'k4')
      resolve(database, 'k4', 'FAILED')
      expect(rows(database, `SELECT status FROM notification_log WHERE claim = 'k4'`)).toEqual([{ status: 'FAILED' }])
      expect(rows(database, `SELECT id FROM notification_log WHERE status = 'SENT'`)).toHaveLength(0)
    })
  })

  test('an unclaimed call to notify() still inserts a fresh row, exactly as today', async () => {
    await withDatabase((database) => {
      seedUser(database)
      database.raw.prepare(
        `INSERT INTO notification_log (id, user_id, type, channel, status, sent_at) VALUES (?, ?, 'account.verify', 'EMAIL', 'SENT', 1)`,
      ).run('n-unclaimed', 'u1')
      expect(rows(database, `SELECT claim FROM notification_log WHERE id = 'n-unclaimed'`)).toEqual([{ claim: null }])
    })
  })
})
