import { describe, expect, test } from 'bun:test'
import { officersWithoutRefundApprovalQuery, refundPreviewRoles, roleHoldersWithoutFactorQuery } from '#server/utils/blast-radius'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// J-105 criterion 1: the refund and second-factor role previews, against the real migrations.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

// Any split the map could produce; FOH_MANAGER stands in for a desk role without money.refund.
function count(database: TestDatabase): number {
  const [query, ...parameters] = boundStatement(database, officersWithoutRefundApprovalQuery(['FOH_MANAGER'], ['ADMIN', 'MANAGER']))
  const [row] = rows<{ count: number }>(database, query, ...parameters)
  return row?.count ?? 0
}

function person(database: TestDatabase, id: string): void {
  database.batch([['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)',
    id, `${id}@e2e.newtheatre.org.uk`, `Someone ${id}`]])
}

function grant(database: TestDatabase, userId: string, role: string, expiresAt: number | null = null): void {
  database.batch([['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)',
    `${userId}-${role}`, userId, role, expiresAt]])
}

// Read from the permission map, so a role gaining or losing the desk moves the count (0090).
describe('the roles the preview reads', () => {
  test('no role holds the desk without refund approval, and the front of house officer approves', () => {
    expect(refundPreviewRoles()).toEqual({ officers: [], approving: ['ADMIN', 'MANAGER', 'FOH_MANAGER'] })
  })
})

describe('officersWithoutRefundApprovalQuery counts who self-approves without the setting (criterion 1)', () => {
  test('a box office officer holding no approving role is counted', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'FOH_MANAGER')
      expect(count(database)).toBe(1)
    })
  })

  test('a box office officer who also holds MANAGER is not counted, already approving', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'FOH_MANAGER')
      grant(database, 'officer-1', 'MANAGER')
      expect(count(database)).toBe(0)
    })
  })

  test('ADMIN is an approving role too, the same as MANAGER', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'FOH_MANAGER')
      grant(database, 'officer-1', 'ADMIN')
      expect(count(database)).toBe(0)
    })
  })

  test('a lapsed FOH_MANAGER grant is not counted at all', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'FOH_MANAGER', Math.floor(Date.now() / 1000) - 3600)
      expect(count(database)).toBe(0)
    })
  })

  test('a lapsed MANAGER grant does not exempt a still-live FOH_MANAGER one', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'FOH_MANAGER')
      grant(database, 'officer-1', 'MANAGER', Math.floor(Date.now() / 1000) - 3600)
      expect(count(database)).toBe(1)
    })
  })

  test('a permanent grant, expires_at NULL, counts as live', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'FOH_MANAGER', null)
      expect(count(database)).toBe(1)
    })
  })

  test('several officers are counted once each, not once per row', async () => {
    await withDatabase((database) => {
      for (const id of ['officer-1', 'officer-2', 'officer-3']) {
        person(database, id)
        grant(database, id, 'FOH_MANAGER')
      }
      grant(database, 'officer-3', 'MANAGER')
      expect(count(database)).toBe(2)
    })
  })

  test('nobody holding FOH_MANAGER at all counts as zero', async () => {
    await withDatabase((database) => {
      expect(count(database)).toBe(0)
    })
  })
})

// Issue 1357: PRIVILEGED_ROLES' own preview. It ignores the proposed list, counting every role
// holder any added role would refuse until they set up an authenticator.
describe('roleHoldersWithoutFactorQuery counts who a role added to the list would refuse', () => {
  const NOW = Math.floor(Date.now() / 1000)

  function holders(database: TestDatabase): number {
    const [query, ...parameters] = boundStatement(database, roleHoldersWithoutFactorQuery(NOW))
    const [row] = rows<{ count: number }>(database, query, ...parameters)
    return row?.count ?? 0
  }

  function signsIn(database: TestDatabase, id: string, password: string | null): void {
    database.batch([['INSERT INTO users (id, email, name, verified, password) VALUES (?, ?, ?, 1, ?)',
      id, `${id}@e2e.newtheatre.org.uk`, `Someone ${id}`, password]])
  }

  function factor(database: TestDatabase, userId: string, confirmedAt: number | null): void {
    database.batch([['INSERT INTO totp_secrets (user_id, secret, confirmed_at) VALUES (?, ?, ?)', userId, 'secret', confirmedAt]])
  }

  test('a role holder signing in with a password and no authenticator is counted, whatever the role', async () => {
    await withDatabase((database) => {
      signsIn(database, 'committee', 'hash')
      grant(database, 'committee', 'COMMITTEE')
      signsIn(database, 'treasurer', 'hash')
      grant(database, 'treasurer', 'TREASURER')
      expect(holders(database)).toBe(2)
    })
  })

  test('a confirmed authenticator takes them out, and one never confirmed does not', async () => {
    await withDatabase((database) => {
      signsIn(database, 'confirmed', 'hash')
      grant(database, 'confirmed', 'COMMITTEE')
      factor(database, 'confirmed', NOW - 60)
      signsIn(database, 'unconfirmed', 'hash')
      grant(database, 'unconfirmed', 'COMMITTEE')
      factor(database, 'unconfirmed', null)
      expect(holders(database)).toBe(1)
    })
  })

  // Workspace 2-step covers a Google-only account, and it holds no password to steal (A-112).
  test('a holder with no password, a lapsed grant and a member with no role are not counted', async () => {
    await withDatabase((database) => {
      signsIn(database, 'google', null)
      grant(database, 'google', 'COMMITTEE')
      signsIn(database, 'lapsed', 'hash')
      grant(database, 'lapsed', 'COMMITTEE', NOW - 3600)
      signsIn(database, 'member', 'hash')
      expect(holders(database)).toBe(0)
    })
  })

  test('two roles count their holder once', async () => {
    await withDatabase((database) => {
      signsIn(database, 'both', 'hash')
      grant(database, 'both', 'COMMITTEE')
      grant(database, 'both', 'BAR_MANAGER')
      expect(holders(database)).toBe(1)
    })
  })
})
