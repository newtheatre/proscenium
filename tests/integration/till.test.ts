import { describe, expect, test } from 'bun:test'
import { openSessionForQuery, sessionByIdQuery, staleUnclosedSessionsQuery } from '#server/utils/till'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { BoundStatement, TestDatabase } from '#tests/helpers/database'
import type { TillSession } from '#shared/utils/till'

// F-102 on the real migrations: at most one open session per venue per night, each closed once,
// and `changes()` deciding who actually opened it rather than who merely asked (0001, 0003, 0044).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function person(database: TestDatabase, suffix = '1'): string {
  const id = `u-${suffix}`
  insert(database, 'users', { id, email: `person-${suffix}@example.invalid`, name: `Person ${suffix}` })
  return id
}

function venue(database: TestDatabase, suffix = '1'): string {
  const id = `venue-${suffix}`
  insert(database, 'venues', { id, name: `The House ${suffix}` })
  return id
}

const openSession = (auditId: string, venueId: string, night: string, openerId: string): BoundStatement[] => [
  [`INSERT INTO till_sessions (id, venue_id, night, opened_by) VALUES (?, ?, ?, ?)
    ON CONFLICT (venue_id, night) WHERE closed_at IS NULL DO NOTHING`, `till-${auditId}`, venueId, night, openerId],
  [`INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ?, ?, 'bar.till.opened', ?, '{}'
    WHERE changes() = 1`, auditId, openerId, `till:${venueId}:${night}`],
]

describe('at most one open session per venue per night, however it is asked for (F-102 criterion 1)', () => {
  test('a plain second open insert for the same venue and night is refused outright', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const venueId = venue(database)
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })

      expect(() => insert(database, 'till_sessions', { id: 't-2', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000 }))
        .toThrow()
    })
  })

  test('a second venue, or a second night, is a session of its own', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const houseId = venue(database, '1')
      const studioId = venue(database, '2')
      insert(database, 'till_sessions', { id: 't-1', venue_id: houseId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })
      insert(database, 'till_sessions', { id: 't-2', venue_id: studioId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })
      insert(database, 'till_sessions', { id: 't-3', venue_id: houseId, night: '2026-09-05', opened_by: opener, opened_at: 1000 })

      expect(rows(database, 'SELECT id FROM till_sessions')).toHaveLength(3)
    })
  })

  // The index covers open rows only, so a session that is not the earlier ones is a session of
  // its own: closed history is never rewritten to open a fresh one (data-model.md, bar sessions).
  test('a closed session does not block a fresh one opening later the same venue and night', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const venueId = venue(database)
      insert(database, 'till_sessions', {
        id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000, closed_by: opener, closed_at: 2000,
      })

      insert(database, 'till_sessions', { id: 't-2', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 3000 })

      expect(rows(database, 'SELECT id FROM till_sessions WHERE venue_id = ?', venueId)).toHaveLength(2)
      const open = rows<TillSession>(database, ...boundStatement(database, openSessionForQuery(venueId, '2026-09-04')))
      expect(open.map(session => session.id)).toEqual(['t-2'])
    })
  })
})

describe('changes() decides who opened it, not who merely asked (F-102 criterion 2, 0003)', () => {
  test('the first opener writes the session and its own audit row', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const venueId = venue(database)

      database.batch(openSession('a1', venueId, '2026-09-04', opener))

      expect(rows(database, 'SELECT id FROM till_sessions')).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  // The loser's own INSERT changes nothing, whatever the winner did, so its audit predicate
  // reads `changes() = 0` and writes nothing either: one session, one audit row between them.
  test('a second opener racing the same venue and night writes neither a session nor an audit row', async () => {
    await withDatabase((database) => {
      const first = person(database, '1')
      const second = person(database, '2')
      const venueId = venue(database)

      database.batch(openSession('a1', venueId, '2026-09-04', first))
      database.batch(openSession('a2', venueId, '2026-09-04', second))

      const sessions = rows<{ id: string, opened_by: string }>(database, 'SELECT id, opened_by FROM till_sessions')
      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.opened_by).toBe(first)
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })
})

describe('closing is a one-way predicate (F-102 criterion 4)', () => {
  test('closing sets both closer columns together', async () => {
    await withDatabase((database) => {
      const opener = person(database, '1')
      const closer = person(database, '2')
      const venueId = venue(database)
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })

      database.batch([
        ['UPDATE till_sessions SET closed_by = ?, closed_at = 2000 WHERE id = ? AND closed_at IS NULL', closer, 't-1'],
      ])

      const [session] = rows<{ closed_by: string, closed_at: number }>(database, 'SELECT closed_by, closed_at FROM till_sessions WHERE id = ?', 't-1')
      expect(session).toMatchObject({ closed_by: closer, closed_at: 2000 })
    })
  })

  test('a closer with no closed_at, or the reverse, is refused by the schema', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const venueId = venue(database)
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })

      expect(() => database.batch([['UPDATE till_sessions SET closed_at = 2000 WHERE id = ?', 't-1']])).toThrow()
      expect(() => database.batch([['UPDATE till_sessions SET closed_by = ? WHERE id = ?', opener, 't-1']])).toThrow()
    })
  })

  test('a close time before the open time is refused by the schema', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const venueId = venue(database)
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 5000 })

      expect(() => database.batch([
        ['UPDATE till_sessions SET closed_by = ?, closed_at = 1000 WHERE id = ?', opener, 't-1'],
      ])).toThrow()
    })
  })

  test('a second close attempt changes nothing: the predicate is the only session that can ever be closed once', async () => {
    await withDatabase((database) => {
      const opener = person(database, '1')
      const first = person(database, '2')
      const second = person(database, '3')
      const venueId = venue(database)
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })

      database.batch([['UPDATE till_sessions SET closed_by = ?, closed_at = 2000 WHERE id = ? AND closed_at IS NULL', first, 't-1']])
      database.batch([['UPDATE till_sessions SET closed_by = ?, closed_at = 3000 WHERE id = ? AND closed_at IS NULL', second, 't-1']])

      const [session] = rows<{ closed_by: string, closed_at: number }>(database, 'SELECT closed_by, closed_at FROM till_sessions WHERE id = ?', 't-1')
      expect(session).toMatchObject({ closed_by: first, closed_at: 2000 })
    })
  })
})

describe('the query builders read what the write path wrote', () => {
  test('openSessionForQuery finds the open session by venue and night, and nothing when there is none', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const venueId = venue(database)
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })

      const found = rows<TillSession>(database, ...boundStatement(database, openSessionForQuery(venueId, '2026-09-04')))
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ id: 't-1', venueId, night: '2026-09-04', openedBy: opener, closedAt: null })

      expect(rows<TillSession>(database, ...boundStatement(database, openSessionForQuery(venueId, '2026-09-05')))).toHaveLength(0)
    })
  })

  test('openSessionForQuery finds nothing once the session is closed, even though the row is still there', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const venueId = venue(database)
      insert(database, 'till_sessions', {
        id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000, closed_by: opener, closed_at: 2000,
      })

      expect(rows<TillSession>(database, ...boundStatement(database, openSessionForQuery(venueId, '2026-09-04')))).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM till_sessions WHERE id = ?', 't-1')).toHaveLength(1)
    })
  })

  test('sessionByIdQuery finds a session by its own id', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const venueId = venue(database)
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })

      const found = rows<TillSession>(database, ...boundStatement(database, sessionByIdQuery('t-1')))
      expect(found).toHaveLength(1)
      expect(found[0]!.id).toBe('t-1')
    })
  })

  // The checklist reads every unclosed session that is not tonight's, whatever venue it is at
  // (F-102 criterion 5).
  test('staleUnclosedSessionsQuery names every unclosed session from an earlier night, and none from tonight or already closed', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const houseId = venue(database, '1')
      const studioId = venue(database, '2')
      insert(database, 'till_sessions', { id: 't-stale', venue_id: houseId, night: '2026-09-03', opened_by: opener, opened_at: 1000 })
      insert(database, 'till_sessions', {
        id: 't-closed', venue_id: studioId, night: '2026-09-02', opened_by: opener, closed_by: opener, closed_at: 9000, opened_at: 1000 })
      insert(database, 'till_sessions', { id: 't-tonight', venue_id: houseId, night: '2026-09-04', opened_by: opener, opened_at: 1000 })

      const found = rows<TillSession>(database, ...boundStatement(database, staleUnclosedSessionsQuery('2026-09-04')))
      expect(found.map(session => session.id)).toEqual(['t-stale'])
    })
  })
})
