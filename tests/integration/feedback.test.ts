import { describe, expect, test } from 'bun:test'
import { erasureStatements } from '#shared/utils/erasure'
import { FEEDBACK_ERASED_BODY } from '#shared/utils/feedback'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// K-134 against the real schema: what the row refuses, what erasure leaves of it, and the
// conditional write the daily triage run makes so two overlapping runs cannot both claim a row (0086).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function addPerson(database: TestDatabase, id: string): void {
  database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', id, `${id}@example.invalid`, 'A Reporter (test)']])
}

function report(database: TestDatabase, id: string, reporterId: string, kind = 'BUG'): void {
  database.batch([[
    `INSERT INTO feedback_reports (id, reporter_id, kind, body, page_path, shell, user_agent, recent_failures)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, reporterId, kind, 'The till froze after the second scan.', '/tonight/till', 'tonight',
    'Mozilla/5.0 (test)', JSON.stringify([{ path: '/api/tonight/till', status: 500, message: 'down', at: 1 }]),
  ]])
}

interface Row { kind: string, body: string, status: string, user_agent: string | null, recent_failures: string | null, reporter_id: string }

describe('the row (criterion 3)', () => {
  test('arrives NEW and keeps what the browser attached', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1')
      report(database, 'fb-1', 'u-1')
      const [row] = rows<Row>(database, 'SELECT kind, body, status, user_agent, recent_failures, reporter_id FROM feedback_reports WHERE id = ?', 'fb-1')
      expect(row).toMatchObject({ kind: 'BUG', status: 'NEW', reporter_id: 'u-1' })
      expect(JSON.parse(row!.recent_failures!)).toHaveLength(1)
    })
  })

  test('a kind, a status or a shell outside the vocabulary is refused by the table', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1')
      expect(() => report(database, 'fb-x', 'u-1', 'RANT')).toThrow()
      report(database, 'fb-1', 'u-1')
      expect(() => database.batch([['UPDATE feedback_reports SET status = ? WHERE id = ?', 'LOST', 'fb-1']])).toThrow()
      expect(() => database.batch([['UPDATE feedback_reports SET shell = ? WHERE id = ?', 'docs', 'fb-1']])).toThrow()
    })
  })

  test('the reporter cannot be deleted from under it', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1')
      report(database, 'fb-1', 'u-1')
      expect(() => database.batch([['DELETE FROM users WHERE id = ?', 'u-1']])).toThrow()
    })
  })
})

describe('erasure scrubs the words and leaves the count (criterion 5)', () => {
  test('the body, the user agent and the failures go; the kind, the path and the status stay', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1')
      addPerson(database, 'u-2')
      report(database, 'fb-1', 'u-1')
      report(database, 'fb-2', 'u-2', 'IDEA')

      database.batch(erasureStatements('u-1', 1_790_000_000).map(statement => boundStatement(database, statement)))

      const [erased] = rows<Row & { page_path: string }>(database, 'SELECT kind, body, status, user_agent, recent_failures, reporter_id, page_path FROM feedback_reports WHERE id = ?', 'fb-1')
      expect(erased).toMatchObject({ kind: 'BUG', body: FEEDBACK_ERASED_BODY, status: 'NEW', user_agent: null, recent_failures: null, reporter_id: 'u-1', page_path: '/tonight/till' })

      const [kept] = rows<Row>(database, 'SELECT kind, body, status, user_agent, recent_failures, reporter_id FROM feedback_reports WHERE id = ?', 'fb-2')
      expect(kept?.body).toBe('The till froze after the second scan.')
      expect(kept?.user_agent).not.toBeNull()
    })
  })
})

describe('the triage run claims a row once (criterion 6, 0086)', () => {
  const claim = `UPDATE feedback_reports SET status = 'TRIAGED', issue_url = ?, triaged_at = unixepoch()
                 WHERE id = ? AND status = 'NEW'`

  test('the first conditional write wins and the second changes nothing', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1')
      report(database, 'fb-1', 'u-1')

      const first = database.raw.prepare(claim).run('https://github.com/newtheatre/proscenium/issues/1', 'fb-1')
      expect(first.changes).toBe(1)
      const second = database.raw.prepare(claim).run('https://github.com/newtheatre/proscenium/issues/2', 'fb-1')
      expect(second.changes).toBe(0)

      const [row] = rows<{ status: string, issue_url: string, triaged_at: number | null }>(database, 'SELECT status, issue_url, triaged_at FROM feedback_reports WHERE id = ?', 'fb-1')
      expect(row).toMatchObject({ status: 'TRIAGED', issue_url: 'https://github.com/newtheatre/proscenium/issues/1' })
      expect(row?.triaged_at).not.toBeNull()
    })
  })

  test('a triaged row must carry its issue and its time, and a new one carries neither', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1')
      report(database, 'fb-1', 'u-1')
      expect(() => database.batch([[`UPDATE feedback_reports SET status = 'TRIAGED' WHERE id = ?`, 'fb-1']])).toThrow()
      expect(() => database.batch([[`UPDATE feedback_reports SET issue_url = 'https://example.invalid/1' WHERE id = ?`, 'fb-1']])).toThrow()
    })
  })
})
