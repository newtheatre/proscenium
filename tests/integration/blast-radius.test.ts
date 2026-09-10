import { describe, expect, test } from 'bun:test'
import { officersWithoutRefundApprovalQuery } from '#server/utils/blast-radius'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// J-105 criterion 1: REFUND_PAID_REQUIRES_MANAGER's own preview, against the real migrations.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function count(database: TestDatabase): number {
  const [query, ...parameters] = boundStatement(database, officersWithoutRefundApprovalQuery(['ADMIN', 'MANAGER']))
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

describe('officersWithoutRefundApprovalQuery counts who self-approves without the setting (criterion 1)', () => {
  test('a box office officer holding no approving role is counted', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'BOX_OFFICE')
      expect(count(database)).toBe(1)
    })
  })

  test('a box office officer who also holds MANAGER is not counted, already approving', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'BOX_OFFICE')
      grant(database, 'officer-1', 'MANAGER')
      expect(count(database)).toBe(0)
    })
  })

  test('ADMIN is an approving role too, the same as MANAGER', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'BOX_OFFICE')
      grant(database, 'officer-1', 'ADMIN')
      expect(count(database)).toBe(0)
    })
  })

  test('a lapsed BOX_OFFICE grant is not counted at all', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'BOX_OFFICE', Math.floor(Date.now() / 1000) - 3600)
      expect(count(database)).toBe(0)
    })
  })

  test('a lapsed MANAGER grant does not exempt a still-live BOX_OFFICE one', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'BOX_OFFICE')
      grant(database, 'officer-1', 'MANAGER', Math.floor(Date.now() / 1000) - 3600)
      expect(count(database)).toBe(1)
    })
  })

  test('a permanent grant, expires_at NULL, counts as live', async () => {
    await withDatabase((database) => {
      person(database, 'officer-1')
      grant(database, 'officer-1', 'BOX_OFFICE', null)
      expect(count(database)).toBe(1)
    })
  })

  test('several officers are counted once each, not once per row', async () => {
    await withDatabase((database) => {
      for (const id of ['officer-1', 'officer-2', 'officer-3']) {
        person(database, id)
        grant(database, id, 'BOX_OFFICE')
      }
      grant(database, 'officer-3', 'MANAGER')
      expect(count(database)).toBe(2)
    })
  })

  test('nobody holding BOX_OFFICE at all counts as zero', async () => {
    await withDatabase((database) => {
      expect(count(database)).toBe(0)
    })
  })
})
