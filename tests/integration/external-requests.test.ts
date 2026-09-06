import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { BoundStatement, TestDatabase } from '#tests/helpers/database'

// Rejecting a request against the real migrations: 0049's audit-atomicity pattern, swept onto
// this route alongside the training cancel route (docs/decisions/0049).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'member@example.invalid', 'A Member'],
    [`INSERT INTO external_requests (id, user_id, title, purpose, starts_at, ends_at, status)
      VALUES ('x1', 'u1', 'A read-through', 'rehearsal', 100, 200, 'REQUESTED')`],
  ])
}

// `changes()` names the row count of the statement just before it on this connection, so the
// reject route's audit insert can read whether *this* UPDATE changed anything (0049).
describe('rejecting a request batches its audit entry, predicated on changes() (0049)', () => {
  const reject = (auditId: string): BoundStatement[] => [
    [`UPDATE external_requests SET status = 'REJECTED', rejection_reason = 'x', decided_at = 1, decided_by = 'u1', updated_at = 1
      WHERE id = 'x1' AND status IN ('REQUESTED', 'AWAITING_EXTERNAL')`],
    [`INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ?, 'u1', 'external.request.rejected', 'external:x1', '{}'
      WHERE changes() = 1`, auditId],
  ]

  test('the first rejection writes exactly one audit entry', async () => {
    await withDatabase((database) => {
      seed(database)

      database.batch(reject('a1'))

      expect(rows<{ status: string }>(database, 'SELECT status FROM external_requests WHERE id = \'x1\'')[0]!.status)
        .toBe('REJECTED')
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  // The loser's own predicate matches nothing even though the row now reads REJECTED, which a
  // predicate over the resulting state rather than changes() could not tell from a win.
  test('a second attempt on an already-rejected request writes no further audit entry', async () => {
    await withDatabase((database) => {
      seed(database)

      database.batch(reject('a1'))
      database.batch(reject('a2'))

      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  // The route reads this same RETURNING clause to tell a win from a loss (0049).
  test('a losing predicate\'s RETURNING is empty, which is what the route refuses on', async () => {
    await withDatabase((database) => {
      seed(database)

      const attempt = (): { id: string }[] => database.raw.prepare(
        `UPDATE external_requests SET status = 'REJECTED' WHERE id = 'x1' AND status IN ('REQUESTED', 'AWAITING_EXTERNAL') RETURNING id`,
      ).all() as { id: string }[]

      expect(attempt()).toHaveLength(1)
      expect(attempt()).toHaveLength(0)
    })
  })
})
