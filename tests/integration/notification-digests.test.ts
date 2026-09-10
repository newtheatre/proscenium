import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// H-104. The statements the digest sweep runs, against the real migrated schema: the hold insert,
// the due predicate (window per topic, opened at the first held message) and the claim.

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

interface HeldRow {
  id?: string
  userId?: string
  topic?: string
  type?: string
  createdAt?: number
  digestLogId?: string | null
}

// Exactly holdForDigest()'s insert: every column notify() writes when a message joins a digest
// instead of sending (H-104 criteria 1, 3).
function hold(database: TestDatabase, over: HeldRow = {}): string {
  const id = over.id ?? `d-${Math.random().toString(36).slice(2, 10)}`
  database.raw.prepare(
    `INSERT INTO notification_digest_entries (id, user_id, topic, type, subject, body, created_at)
     VALUES (?, ?, ?, ?, 'A change', 'It changed.', ?)`,
  ).run(id, over.userId ?? 'u1', over.topic ?? 'ROOMS', over.type ?? 'room.booking.confirmed', over.createdAt ?? NOW - 3600)
  return id
}

// Exactly dueUsers(): grouped by person, the window read per topic and compared against the
// earliest unclaimed entry, never per row (0003).
function due(database: TestDatabase, topic: string, windowMinutes: number, nowEpoch = NOW): string[] {
  return (database.raw.prepare(
    `SELECT user_id AS userId FROM notification_digest_entries
     WHERE topic = ? AND digest_log_id IS NULL
     GROUP BY user_id
     HAVING MIN(created_at) + ? <= ?`,
  ).all(topic, windowMinutes * 60, nowEpoch) as { userId: string }[]).map(row => row.userId)
}

// Exactly claimEntries(): a conditional UPDATE, so a second overlapping run finds nothing left
// (0003, 0048).
function claim(database: TestDatabase, topic: string, userId: string, digestLogId: string): { subject: string, body: string }[] {
  return database.raw.prepare(
    `UPDATE notification_digest_entries SET digest_log_id = ?
     WHERE topic = ? AND user_id = ? AND digest_log_id IS NULL
     RETURNING subject, body`,
  ).all(digestLogId, topic, userId) as { subject: string, body: string }[]
}

describe('an entry is held rather than sent (criteria 1, 3)', () => {
  test('a held entry has no claim on it yet', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const id = hold(database)
      expect(rows(database, `SELECT digest_log_id FROM notification_digest_entries WHERE id = ?`, id))
        .toEqual([{ digest_log_id: null }])
    })
  })

  test('a topic outside the five is refused by the table', async () => {
    await withDatabase((database) => {
      seedUser(database)
      expect(() => hold(database, { topic: 'GOSSIP' })).toThrow()
    })
  })
})

describe('what the sweep picks up (criterion 2)', () => {
  test('an entry inside its topic window is not due yet', async () => {
    await withDatabase((database) => {
      seedUser(database)
      hold(database, { createdAt: NOW - 30 * 60 })
      expect(due(database, 'ROOMS', 60)).toEqual([])
    })
  })

  test('an entry past its topic window is due', async () => {
    await withDatabase((database) => {
      seedUser(database)
      hold(database, { createdAt: NOW - 61 * 60 })
      expect(due(database, 'ROOMS', 60)).toEqual(['u1'])
    })
  })

  // The window opens at the first held message: a second, newer entry for the same person and
  // topic does not push the due time back (criterion 2).
  test('the window is set by the earliest unclaimed entry, not the latest', async () => {
    await withDatabase((database) => {
      seedUser(database)
      hold(database, { id: 'first', createdAt: NOW - 61 * 60 })
      hold(database, { id: 'second', createdAt: NOW - 5 * 60 })
      expect(due(database, 'ROOMS', 60)).toEqual(['u1'])
    })
  })

  test('a different topic has its own window', async () => {
    await withDatabase((database) => {
      seedUser(database)
      hold(database, { topic: 'ROOMS', createdAt: NOW - 61 * 60 })
      expect(due(database, 'SHIFTS', 60)).toEqual([])
    })
  })

  test('two people each due are both returned', async () => {
    await withDatabase((database) => {
      seedUser(database, 'u1')
      seedUser(database, 'u2')
      hold(database, { userId: 'u1', createdAt: NOW - 61 * 60 })
      hold(database, { userId: 'u2', createdAt: NOW - 90 * 60 })
      expect(due(database, 'ROOMS', 60).sort()).toEqual(['u1', 'u2'])
    })
  })
})

describe('the claim moves every unclaimed entry for the pair at once (0003, 0048)', () => {
  test('everything claimed carries the same digest id', async () => {
    await withDatabase((database) => {
      seedUser(database)
      hold(database, { id: 'a', createdAt: NOW - 61 * 60 })
      hold(database, { id: 'b', createdAt: NOW - 61 * 60 })
      const claimed = claim(database, 'ROOMS', 'u1', 'digest-1')
      expect(claimed).toHaveLength(2)
      expect(rows(database, `SELECT DISTINCT digest_log_id FROM notification_digest_entries`))
        .toEqual([{ digest_log_id: 'digest-1' }])
    })
  })

  test('a second overlapping claim finds nothing left', async () => {
    await withDatabase((database) => {
      seedUser(database)
      hold(database, { createdAt: NOW - 61 * 60 })
      claim(database, 'ROOMS', 'u1', 'digest-1')
      expect(claim(database, 'ROOMS', 'u1', 'digest-2')).toEqual([])
    })
  })

  // An entry that arrives after the claim opens its own window rather than joining the digest
  // that already went (criterion 6: a sixth after the window closes is a second email).
  test('an entry held after the claim is untouched by it', async () => {
    await withDatabase((database) => {
      seedUser(database)
      hold(database, { id: 'claimed', createdAt: NOW - 61 * 60 })
      claim(database, 'ROOMS', 'u1', 'digest-1')
      hold(database, { id: 'later', createdAt: NOW })
      expect(rows(database, `SELECT id FROM notification_digest_entries WHERE digest_log_id IS NULL`))
        .toEqual([{ id: 'later' }])
    })
  })
})

describe('an entry outlives its own send only as long as the log row does (criterion 5)', () => {
  function loggedRow(database: TestDatabase, id: string): void {
    database.raw.prepare(
      `INSERT INTO notification_log (id, user_id, type, channel, status, subject, sent_at)
       VALUES (?, 'u1', 'digest.rooms', 'EMAIL', 'SENT', 'Digest', 1)`,
    ).run(id)
  }

  test('claiming into a real log row is what "was I told about X" answers from', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const entryId = hold(database, { createdAt: NOW - 61 * 60 })
      loggedRow(database, 'digest-1')
      claim(database, 'ROOMS', 'u1', 'digest-1')
      expect(rows(database, `SELECT subject, body FROM notification_digest_entries WHERE id = ?`, entryId))
        .toEqual([{ subject: 'A change', body: 'It changed.' }])
    })
  })

  test('a claimed entry whose log row still exists is not touched by the prune', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const entryId = hold(database, { createdAt: NOW - 61 * 60 })
      loggedRow(database, 'digest-1')
      claim(database, 'ROOMS', 'u1', 'digest-1')
      expect(pruneOrphans(database)).toEqual([])
      expect(rows(database, `SELECT id FROM notification_digest_entries WHERE id = ?`, entryId)).toEqual([{ id: entryId }])
    })
  })

  // Exactly pruneOrphanedDigestEntries(): no foreign key does this automatically (0061, the
  // rebuild-dependent check check:migrations refuses), so the prune notices the gone row itself.
  function pruneOrphans(database: TestDatabase): string[] {
    return (database.raw.prepare(
      `DELETE FROM notification_digest_entries
       WHERE id IN (
         SELECT id FROM notification_digest_entries
         WHERE digest_log_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM notification_log WHERE notification_log.id = notification_digest_entries.digest_log_id)
       )
       RETURNING id`,
    ).all() as { id: string }[]).map(row => row.id)
  }

  test('pruning the log row leaves its constituent entries for this to notice and take', async () => {
    await withDatabase((database) => {
      seedUser(database)
      const claimed = hold(database, { id: 'claimed', createdAt: NOW - 61 * 60 })
      loggedRow(database, 'digest-1')
      claim(database, 'ROOMS', 'u1', 'digest-1')
      // Held after the claim, so it is genuinely still pending rather than swept up with it.
      const untouched = hold(database, { id: 'pending', createdAt: NOW })

      database.raw.prepare(`DELETE FROM notification_log WHERE id = 'digest-1'`).run()
      expect(pruneOrphans(database)).toEqual([claimed])

      expect(rows(database, `SELECT id FROM notification_digest_entries WHERE id = ?`, claimed)).toEqual([])
      expect(rows(database, `SELECT id FROM notification_digest_entries WHERE id = ?`, untouched)).toEqual([{ id: untouched }])
    })
  })
})
