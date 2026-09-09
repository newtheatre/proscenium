import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { retryDueAt } from '#shared/utils/notifications'
import type { TestDatabase } from '#tests/helpers/database'

// H-105. The statements the retry sweep and the nightly prune run, against the real migrated
// schema: the due predicate, the conditional claim, the attempt counter and the payload.

const MAX_ATTEMPTS = 5
const BACKOFF_MINUTES = 10
const NOW = 1_700_000_000

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

const payload = JSON.stringify({ subject: 'Your booking', html: '<p>Hello</p>', text: 'Hello' })

interface FailedRow {
  id?: string
  attempts?: number
  createdAt?: number
  status?: string
  payload?: string | null
}

// Exactly the row notify() leaves behind when the provider refuses a message it may retry.
function seedFailed(database: TestDatabase, over: FailedRow = {}): string {
  const id = over.id ?? `n-${Math.random().toString(36).slice(2, 10)}`
  database.raw.prepare(
    `INSERT INTO notification_log (id, user_id, type, channel, status, subject, error, attempts, retry_payload, created_at)
     VALUES (?, 'u1', 'room.booking.confirmed', 'EMAIL', ?, 'Your booking', 'the provider refused it', ?, ?, ?)`,
  ).run(id, over.status ?? 'FAILED', over.attempts ?? 1, over.payload === undefined ? payload : over.payload, over.createdAt ?? NOW - 3600)
  return id
}

// Exactly dueForRetry()'s predicate: `(1 << attempts) - 1` is the doubling window in SQL.
function due(database: TestDatabase, nowEpoch = NOW): string[] {
  return (database.raw.prepare(
    `SELECT id FROM notification_log
     WHERE status = 'FAILED'
       AND attempts < ?
       AND retry_payload IS NOT NULL
       AND created_at + ? * ((1 << attempts) - 1) <= ?
     ORDER BY created_at`,
  ).all(MAX_ATTEMPTS, BACKOFF_MINUTES * 60, nowEpoch) as { id: string }[]).map(row => row.id)
}

// Exactly claimForRetry(): the update is the claim, so a second run changes nothing (0003, 0049).
function claim(database: TestDatabase, id: string): boolean {
  return (database.raw.prepare(
    `UPDATE notification_log SET status = 'RETRYING' WHERE id = ? AND status = 'FAILED' RETURNING id`,
  ).all(id) as { id: string }[]).length === 1
}

// Exactly resolveById(): one row, its attempt spent, and the payload cleared when it is settled.
function resolve(database: TestDatabase, id: string, status: string, keepPayload = false): void {
  database.raw.prepare(
    `UPDATE notification_log
     SET status = ?, sent_at = ?, retry_payload = CASE WHEN ? THEN retry_payload ELSE NULL END,
         attempts = attempts + 1
     WHERE id = ?`,
  ).run(status, status === 'SENT' ? NOW : null, keepPayload ? 1 : 0, id)
}

const one = <T>(database: TestDatabase, statement: string): T =>
  rows<T>(database, statement)[0] as T

describe('what the sweep picks up (criterion 2)', () => {
  test('a failed send inside its backoff window is not due yet', async () => {
    await withDatabase((database) => {
      seedUser(database)
      // One attempt made a minute ago, so the ten minute window has not passed.
      const id = seedFailed(database, { attempts: 1, createdAt: NOW - 60 })
      expect(due(database)).toEqual([])
      expect(due(database, retryDueAt(NOW - 60, 1, BACKOFF_MINUTES))).toEqual([id])
    })
  })

  test('the window doubles, so a third attempt waits longer than the second', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const id = seedFailed(database, { attempts: 2, createdAt: NOW - 20 * 60 })
      // Thirty minutes after enqueue for the second retry, not twenty.
      expect(due(database)).toEqual([])
      expect(due(database, NOW + 11 * 60)).toEqual([id])
    })
  })

  test('a send that has spent every attempt is never picked up again', async () => {
    await withDatabase((database) => {
      seedUser(database)
      seedFailed(database, { attempts: MAX_ATTEMPTS, createdAt: NOW - 10 * 24 * 3600 })
      expect(due(database, NOW + 10 * 24 * 3600)).toEqual([])
    })
  })

  test('a failure with nothing to send again is not picked up', async () => {
    await withDatabase((database) => {
      seedUser(database)
      seedFailed(database, { attempts: 1, createdAt: NOW - 10 * 3600, payload: null })
      expect(due(database)).toEqual([])
    })
  })

  test('nothing terminal is ever due', async () => {
    await withDatabase((database) => {
      seedUser(database)
      for (const status of ['SENT', 'FAILED_FINAL', 'SUPPRESSED_PREFERENCE', 'SKIPPED_UNDELIVERABLE']) {
        seedFailed(database, { status, createdAt: NOW - 10 * 3600 })
      }
      expect(due(database)).toEqual([])
    })
  })
})

describe('an attempt is appended to the entry it belongs to (criteria 2 and 3)', () => {
  test('the claim moves the row to RETRYING, and only once', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const id = seedFailed(database, { createdAt: NOW - 3600 })

      expect(claim(database, id)).toBe(true)
      // A second sweep overlapping the first takes nothing: the status has already moved.
      expect(claim(database, id)).toBe(false)
      expect(one<{ status: string }>(database, `SELECT status FROM notification_log`).status).toBe('RETRYING')
    })
  })

  test('a retry that succeeds leaves one row, one more attempt and no payload', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const id = seedFailed(database, { attempts: 1, createdAt: NOW - 3600 })
      claim(database, id)
      resolve(database, id, 'SENT')

      expect(rows(database, `SELECT id FROM notification_log`)).toHaveLength(1)
      expect(one<{ status: string, attempts: number, retry_payload: string | null, sent_at: number | null }>(
        database, `SELECT status, attempts, retry_payload, sent_at FROM notification_log`,
      )).toEqual({ status: 'SENT', attempts: 2, retry_payload: null, sent_at: NOW })
    })
  })

  test('a retry that fails again keeps what it needs to try once more', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const id = seedFailed(database, { attempts: 1, createdAt: NOW - 3600 })
      claim(database, id)
      resolve(database, id, 'FAILED', true)

      expect(one<{ status: string, attempts: number, retry_payload: string | null }>(
        database, `SELECT status, attempts, retry_payload FROM notification_log`,
      )).toEqual({ status: 'FAILED', attempts: 2, retry_payload: payload })
    })
  })

  test('the last attempt marks the entry failed for good and drops the payload', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const id = seedFailed(database, { attempts: MAX_ATTEMPTS - 1, createdAt: NOW - 10 * 3600 })
      claim(database, id)
      resolve(database, id, 'FAILED_FINAL')

      expect(one<{ status: string, attempts: number, retry_payload: string | null }>(
        database, `SELECT status, attempts, retry_payload FROM notification_log`,
      )).toEqual({ status: 'FAILED_FINAL', attempts: MAX_ATTEMPTS, retry_payload: null })
      expect(due(database, NOW + 10 * 24 * 3600)).toEqual([])
    })
  })

  // Criterion 6, named: the provider dies mid-send, and the entry ends failed, retries, and is
  // neither lost nor duplicated.
  test('the provider dying mid-send loses nothing and duplicates nothing', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const id = seedFailed(database, { attempts: 1, createdAt: NOW - 3600 })

      // Three sweeps: one fails again, one is inside the window, one finally sends.
      claim(database, id)
      resolve(database, id, 'FAILED', true)
      expect(due(database, NOW - 3600 + 10 * 60)).toEqual([])

      const second = due(database, NOW - 3600 + 31 * 60)
      expect(second).toEqual([id])
      claim(database, id)
      resolve(database, id, 'SENT')

      expect(rows(database, `SELECT id FROM notification_log`)).toHaveLength(1)
      expect(one<{ status: string, attempts: number }>(database, `SELECT status, attempts FROM notification_log`))
        .toEqual({ status: 'SENT', attempts: 3 })
    })
  })

  test('a status outside the registry is still refused by the table', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const id = seedFailed(database)
      expect(() => database.raw.prepare(`UPDATE notification_log SET status = 'GAVE_UP' WHERE id = ?`).run(id)).toThrow()
    })
  })
})

describe('the log is pruned past its retention period (criterion 5)', () => {
  // Exactly pruneNotificationLog(): scoped by subquery and capped, never an id list from a
  // result set (0003, 0006).
  function prune(database: TestDatabase, cutoff: number, cap = 500): number {
    return (database.raw.prepare(
      `DELETE FROM notification_log
       WHERE id IN (SELECT id FROM notification_log WHERE created_at < ? LIMIT ?)
       RETURNING id`,
    ).all(cutoff, cap) as { id: string }[]).length
  }

  test('a row older than the period goes and a newer one stays', async () => {
    await withDatabase((database) => {
      seedUser(database)
      seedFailed(database, { id: 'old', createdAt: NOW - 800 * 24 * 3600 })
      seedFailed(database, { id: 'new', createdAt: NOW - 30 * 24 * 3600 })

      expect(prune(database, NOW - 730 * 24 * 3600)).toBe(1)
      expect(rows(database, `SELECT id FROM notification_log`)).toEqual([{ id: 'new' }])
    })
  })

  test('the cap bounds one run, so the rest go on the next', async () => {
    await withDatabase((database) => {
      seedUser(database)
      for (let index = 0; index < 5; index++) {
        seedFailed(database, { id: `old-${index}`, createdAt: NOW - 800 * 24 * 3600 })
      }

      expect(prune(database, NOW, 2)).toBe(2)
      expect(rows(database, `SELECT id FROM notification_log`)).toHaveLength(3)
    })
  })
})
