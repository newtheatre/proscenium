import { describe, expect, test } from 'bun:test'
import { authorisedTabHoldersQuery } from '#server/utils/tab-holders'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// F-108 criterion 1 as amended for issue 1264: the set a charge is refused against is the named
// people plus the live holders of the named roles, run against the real migrations.

const NOW = 1_790_000_000
const DAY = 86_400

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function people(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-named', 'named@example.invalid', 'Named Person'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-committee', 'committee@example.invalid', 'Committee Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-lapsed', 'lapsed@example.invalid', 'Lapsed Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-permanent', 'permanent@example.invalid', 'Permanent Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-other-role', 'other@example.invalid', 'Other Role'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-nobody', 'nobody@example.invalid', 'Nobody'],
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-live', 'u-committee', 'COMMITTEE', NOW + 30 * DAY],
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-lapsed', 'u-lapsed', 'COMMITTEE', NOW - DAY],
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, NULL)', 'g-permanent', 'u-permanent', 'COMMITTEE'],
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-other', 'u-other-role', 'SAFETY_OFFICER', NOW + 30 * DAY],
  ])
}

function holders(database: TestDatabase, ids: string[], roles: string[], only?: string): string[] {
  const [query, ...parameters] = boundStatement(database, authorisedTabHoldersQuery(ids, roles, NOW, only))
  return rows<{ id: string }>(database, query, ...parameters).map(row => row.id)
}

describe('who a charge to a tab is refused for (F-108 criterion 1, issue 1264)', () => {
  test('a person named on the list is a holder', () => withDatabase((database) => {
    people(database)
    expect(holders(database, ['u-named'], [], 'u-named')).toEqual(['u-named'])
  }))

  test('a live holder of a named role is a holder, without being named', () => withDatabase((database) => {
    people(database)
    expect(holders(database, [], ['COMMITTEE'], 'u-committee')).toEqual(['u-committee'])
    expect(holders(database, [], ['COMMITTEE'], 'u-permanent')).toEqual(['u-permanent'])
  }))

  // Roles expire at the committee year end (0009): a grant past its expiry is no longer a fact.
  test('a grant that has lapsed authorises nobody', () => withDatabase((database) => {
    people(database)
    expect(holders(database, [], ['COMMITTEE'], 'u-lapsed')).toEqual([])
  }))

  test('a grant of a role that is not named authorises nobody', () => withDatabase((database) => {
    people(database)
    expect(holders(database, [], ['COMMITTEE'], 'u-other-role')).toEqual([])
  }))

  test('somebody neither named nor holding a named role is refused', () => withDatabase((database) => {
    people(database)
    expect(holders(database, ['u-named'], ['COMMITTEE'], 'u-nobody')).toEqual([])
    expect(holders(database, [], [], 'u-named')).toEqual([])
  }))

  test('an anonymised account is never a holder, however it qualified', () => withDatabase((database) => {
    people(database)
    database.batch([['UPDATE users SET anonymised_at = ? WHERE id IN (?, ?)', NOW, 'u-named', 'u-committee']])
    expect(holders(database, ['u-named'], ['COMMITTEE'])).toEqual(['u-permanent'])
  }))

  test('the till lists both kinds together, once each and by name', () => withDatabase((database) => {
    people(database)
    expect(holders(database, ['u-named', 'u-committee'], ['COMMITTEE'])).toEqual(['u-committee', 'u-named', 'u-permanent'])
  }))

  // The grants are matched by subquery, never expanded to ids, and each list rides as one
  // parameter, so a long list cannot push the statement past D1's bound (0003, 0006).
  test('the statement binds the same few parameters however long the lists are', () => withDatabase((database) => {
    const ids = Array.from({ length: 200 }, (_, index) => `u-${index}`)
    const [, ...few] = boundStatement(database, authorisedTabHoldersQuery(['u-named'], ['COMMITTEE'], NOW))
    const [, ...many] = boundStatement(database, authorisedTabHoldersQuery(ids, ['COMMITTEE', 'TREASURER'], NOW))
    expect(many.length).toBe(few.length)
    expect(many.length).toBeLessThan(10)
  }))
})
