import { describe, expect, test } from 'bun:test'
import { isSustainedlyUnhealthy } from '#shared/utils/health'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// J-106 criteria 3 and 5, against the real migrations: opening, notifying and closing a health
// incident. Mirrors what server/utils/health.ts's watchHealth() executes.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function person(database: TestDatabase, suffix = '1'): string {
  const id = `u-${suffix}`
  database.batch([[
    'INSERT INTO users (id, email, name) VALUES (?, ?, ?)',
    id, `admin-${suffix}@example.invalid`, `Admin ${suffix}`,
  ]])
  return id
}

// The predicate rather than a caught unique-violation: a race here writes nothing (0003, 0006).
function openIncident(database: TestDatabase, id: string, openedAt: number): void {
  database.batch([[
    `INSERT INTO health_incidents (id, opened_at)
     SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM health_incidents WHERE status = 'OPEN')`,
    id, openedAt,
  ]])
}

function openIncidentId(database: TestDatabase): string | undefined {
  return rows<{ id: string }>(database, 'SELECT id FROM health_incidents WHERE status = \'OPEN\'')[0]?.id
}

describe('a first unhealthy check opens an incident and sends nothing yet (J-106 criterion 5)', () => {
  test('one incident opens, nothing claims a notification', async () => {
    await withDatabase((database) => {
      openIncident(database, 'i-1', 1_000_000)

      const open = rows<{ id: string, status: string }>(database, 'SELECT id, status FROM health_incidents')
      expect(open).toHaveLength(1)
      expect(open[0]!.status).toBe('OPEN')
      expect(rows(database, 'SELECT id FROM notification_log WHERE type = \'health.alert\'')).toEqual([])
    })
  })

  test('a second unhealthy check while one is already open opens nothing further', async () => {
    await withDatabase((database) => {
      openIncident(database, 'i-1', 1_000_000)
      openIncident(database, 'i-2', 1_000_100)

      const open = rows<{ id: string }>(database, 'SELECT id FROM health_incidents')
      expect(open).toHaveLength(1)
      expect(open[0]!.id).toBe('i-1')
    })
  })
})

describe('a second unhealthy check inside the configured window still sends nothing (J-106 criterion 5)', () => {
  test('the pure predicate refuses to call it sustained yet', () => {
    const openedAt = 1_000_000
    const now = openedAt + 10 * 60
    expect(isSustainedlyUnhealthy(openedAt, 30, now)).toBe(false)
  })
})

describe('unhealthiness lasting past the configured window notifies once, not on every run (J-106 criterion 5)', () => {
  test('the claim is taken once; a second attempt with the same key takes nothing', async () => {
    await withDatabase((database) => {
      const admin = person(database)
      openIncident(database, 'i-1', 1_000_000)
      const incidentId = openIncidentId(database)!
      const key = `health.alert:${incidentId}:${admin}`

      const first = database.raw.query(
        `INSERT INTO notification_log (id, user_id, type, channel, status, claim)
         VALUES (?, ?, 'health.alert', 'EMAIL', 'PENDING', ?)
         ON CONFLICT DO NOTHING RETURNING id`,
      ).all('n-1', admin, key)
      const second = database.raw.query(
        `INSERT INTO notification_log (id, user_id, type, channel, status, claim)
         VALUES (?, ?, 'health.alert', 'EMAIL', 'PENDING', ?)
         ON CONFLICT DO NOTHING RETURNING id`,
      ).all('n-2', admin, key)

      expect(first).toHaveLength(1)
      expect(second).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM notification_log WHERE claim = ?', key)).toHaveLength(1)
    })
  })
})

describe('a check that recovers closes the incident, so the next failure alerts again from cold (J-106 criterion 5)', () => {
  test('closing sets status and closed_at, and a fresh incident may then open', async () => {
    await withDatabase((database) => {
      openIncident(database, 'i-1', 1_000_000)

      database.batch([[
        'UPDATE health_incidents SET status = \'CLOSED\', closed_at = ? WHERE id = ?',
        1_002_000, 'i-1',
      ]])

      expect(openIncidentId(database)).toBeUndefined()
      const closed = rows<{ status: string, closed_at: number }>(database, 'SELECT status, closed_at FROM health_incidents WHERE id = \'i-1\'')[0]!
      expect(closed.status).toBe('CLOSED')
      expect(closed.closed_at).toBe(1_002_000)

      openIncident(database, 'i-2', 1_003_000)
      expect(openIncidentId(database)).toBe('i-2')
    })
  })

  test('a closed incident cannot be reopened by the CHECK: closed_at and OPEN cannot coexist', async () => {
    await withDatabase((database) => {
      openIncident(database, 'i-1', 1_000_000)
      expect(() => database.raw.exec(
        'UPDATE health_incidents SET closed_at = 1002000 WHERE id = \'i-1\'',
      )).toThrow()
    })
  })
})
