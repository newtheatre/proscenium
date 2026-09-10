import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { NOTIFICATION_TOPICS } from '#shared/utils/notifications'
import type { TestDatabase } from '#tests/helpers/database'

// H-102. The statements the preference route and the notification centre run, against the real
// migrated schema, as notification-log.test.ts does for the claim.

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

// Exactly savePreference()'s upsert: one row per person per topic, whatever the screen sends.
function setPreference(database: TestDatabase, topic: string, email: number, push: number, userId = 'u1'): void {
  database.raw.prepare(
    `INSERT INTO notification_preferences (user_id, topic, email, push) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, topic) DO UPDATE SET email = excluded.email, push = excluded.push`,
  ).run(userId, topic, email, push)
}

describe('a preference is one row per person per topic (H-102 criterion 2)', () => {
  test('every one of the five topics is a value the table accepts', async () => {
    await withDatabase((database) => {
      seedUser(database)
      for (const topic of NOTIFICATION_TOPICS) setPreference(database, topic, 0, 0)
      expect(rows(database, 'SELECT topic FROM notification_preferences ORDER BY topic')).toHaveLength(5)
    })
  })

  test('a topic outside the five is refused by the table, not merely by the route', async () => {
    await withDatabase((database) => {
      seedUser(database)
      expect(() => setPreference(database, 'GOSSIP', 0, 0)).toThrow()
    })
  })

  test('changing a preference twice leaves one row, not two', async () => {
    await withDatabase((database) => {
      seedUser(database)
      setPreference(database, 'ROOMS', 0, 0)
      setPreference(database, 'ROOMS', 1, 0)
      expect(rows(database, `SELECT email, push FROM notification_preferences WHERE topic = 'ROOMS'`))
        .toEqual([{ email: 1, push: 0 }])
    })
  })

  // Criterion 2's other half: a row that was never written is the configured default, which is
  // why absence has to stay absence rather than being seeded on registration.
  test('a new account carries no preference rows at all', async () => {
    await withDatabase((database) => {
      seedUser(database)
      expect(rows(database, 'SELECT topic FROM notification_preferences')).toEqual([])
    })
  })

  test('erasing the person takes their choices with them', async () => {
    await withDatabase((database) => {
      seedUser(database)
      setPreference(database, 'ROOMS', 0, 0)
      database.raw.prepare('DELETE FROM users WHERE id = ?').run('u1')
      expect(rows(database, 'SELECT topic FROM notification_preferences')).toEqual([])
    })
  })
})

describe('a suppressed message is a status of its own (H-102 criterion 3)', () => {
  test('the send log accepts SUPPRESSED_PREFERENCE', async () => {
    await withDatabase((database) => {
      seedUser(database)
      database.raw.prepare(
        `INSERT INTO notification_log (id, user_id, type, channel, status)
         VALUES (?, ?, 'room.request.raised', 'EMAIL', 'SUPPRESSED_PREFERENCE')`,
      ).run('n1', 'u1')
      expect(rows(database, `SELECT status, sent_at, error FROM notification_log WHERE id = 'n1'`))
        .toEqual([{ status: 'SUPPRESSED_PREFERENCE', sent_at: null, error: null }])
    })
  })

  test('a claimed send resolves to it in place, one row still', async () => {
    await withDatabase((database) => {
      seedUser(database)
      database.raw.prepare(
        `INSERT INTO notification_log (id, user_id, type, channel, status, claim)
         VALUES (?, ?, 'shift.reminder', 'EMAIL', 'PENDING', 'shift:1')`,
      ).run('n2', 'u1')
      database.raw.prepare(`UPDATE notification_log SET status = 'SUPPRESSED_PREFERENCE' WHERE claim = ?`).run('shift:1')
      expect(rows(database, `SELECT id, status FROM notification_log WHERE claim = 'shift:1'`))
        .toEqual([{ id: 'n2', status: 'SUPPRESSED_PREFERENCE' }])
    })
  })

  test('a status nobody registered is still refused', async () => {
    await withDatabase((database) => {
      seedUser(database)
      expect(() => database.raw.prepare(
        `INSERT INTO notification_log (id, user_id, type, channel, status)
         VALUES (?, ?, 'shift.reminder', 'EMAIL', 'MUTED')`,
      ).run('n3', 'u1')).toThrow()
    })
  })
})

describe('the inbox is written whatever the email preference says (H-102 criterion 6)', () => {
  test('a suppressed email still leaves an inbox entry to find', async () => {
    await withDatabase((database) => {
      seedUser(database)
      setPreference(database, 'ROOMS', 0, 0)
      database.batch([
        [`INSERT INTO inbox_items (id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)`,
          'i1', 'u1', 'room.request.raised', 'A room was requested', 'The details.'],
        [`INSERT INTO notification_log (id, user_id, type, channel, status)
          VALUES (?, ?, 'room.request.raised', 'EMAIL', 'SUPPRESSED_PREFERENCE')`, 'n4', 'u1'],
      ])

      expect(rows(database, `SELECT title FROM inbox_items WHERE user_id = 'u1'`))
        .toEqual([{ title: 'A room was requested' }])
      expect(rows(database, `SELECT status FROM notification_log WHERE user_id = 'u1'`))
        .toEqual([{ status: 'SUPPRESSED_PREFERENCE' }])
    })
  })

  test('an inbox entry goes when the person is erased', async () => {
    await withDatabase((database) => {
      seedUser(database)
      database.batch([
        [`INSERT INTO inbox_items (id, user_id, type, title) VALUES (?, ?, ?, ?)`,
          'i2', 'u1', 'room.request.raised', 'A room was requested'],
      ])
      database.raw.prepare('DELETE FROM users WHERE id = ?').run('u1')
      expect(rows(database, 'SELECT id FROM inbox_items')).toEqual([])
    })
  })
})
