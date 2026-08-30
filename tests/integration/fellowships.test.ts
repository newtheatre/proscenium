import { describe, expect, test } from 'bun:test'
import { erasureStatements } from '#shared/utils/erasure'
import { PERSONAL_TABLES } from '#shared/utils/personal-data'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// A fellowship is the theatre's record about a person rather than the person's own, which is why
// it behaves unlike everything else attached to an account (0023, A-127).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function addPerson(database: TestDatabase, id: string, email: string): void {
  database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', id, email, 'An Alumna (test)']])
}

function award(database: TestDatabase, id: string, userId: string): void {
  database.batch([[
    'INSERT INTO fellowships (id, user_id, awarded_on, awarded_by, citation) VALUES (?, ?, ?, ?, ?)',
    id, userId, '2019-06-12', 'Committee, 12 June 2019', 'For a decade behind the lighting desk.',
  ]])
}

describe('a fellowship is held once and for life (A-127)', () => {
  test('a second award to the same person is refused by the constraint, not by the form', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'fellow@example.invalid')
      award(database, 'f-1', 'u-1')
      expect(() => award(database, 'f-2', 'u-1')).toThrow()
    })
  })

  // Criterion 6. Nothing deletes a user, but the reference is what makes that a guarantee rather
  // than a convention.
  test('deleting the person is refused while an award stands', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'fellow@example.invalid')
      award(database, 'f-1', 'u-1')
      expect(() => database.batch([['DELETE FROM users WHERE id = ?', 'u-1']])).toThrow()
    })
  })

  // Criterion 4: a revocation is a second fact, not a correction to the first.
  test('revoking rewrites nothing the award recorded', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'fellow@example.invalid')
      award(database, 'f-1', 'u-1')
      database.batch([[
        'UPDATE fellowships SET revoked_at = ?, revoked_by = ?, revocation_reason = ? WHERE id = ?',
        1780000000, 'u-2', 'A safeguarding matter.', 'f-1',
      ]])

      const [held] = rows<{ awarded: string, citation: string, revoked: number }>(
        database, 'SELECT awarded_on AS awarded, citation, revoked_at AS revoked FROM fellowships WHERE id = ?', 'f-1')
      expect(held!.awarded).toBe('2019-06-12')
      expect(held!.citation).toContain('lighting desk')
      expect(held!.revoked).toBe(1780000000)
    })
  })
})

describe('an erasure leaves the award standing (0011, A-127 criterion 6)', () => {
  test('the person is anonymised, the award survives, and only the reason goes', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'fellow@example.invalid')
      award(database, 'f-1', 'u-1')
      database.batch([['UPDATE fellowships SET revocation_reason = ? WHERE id = ?', 'Named somebody.', 'f-1']])

      // One batch, all or nothing, the way production runs it (K-109 criterion 1).
      database.batch(erasureStatements('u-1', 1780000001).map(statement => boundStatement(database, statement)))

      const [held] = rows<{ citation: string, reason: string | null }>(
        database, 'SELECT citation, revocation_reason AS reason FROM fellowships WHERE id = ?', 'f-1')
      expect(held).toBeDefined()
      expect(held!.citation).toContain('lighting desk')
      expect(held!.reason).toBeNull()

      const [person] = rows<{ name: string }>(database, 'SELECT name FROM users WHERE id = ?', 'u-1')
      expect(person!.name).toBe('Deleted user')
    })
  })

  test('the registry keeps the row rather than deleting it, which is what restrict relies on', () => {
    const entry = PERSONAL_TABLES.find(table => table.name === 'fellowships')
    expect(entry).toBeDefined()
    expect(entry!.erasure).toBe('scrub')
    expect(entry!.scrub).toEqual(['revocation_reason'])
  })
})
