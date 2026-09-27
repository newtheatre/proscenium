import { describe, expect, test } from 'bun:test'
import { auditIfChanged } from '#server/utils/audit'
import { renameDiscountStatement } from '#server/utils/discounts'
import { pruneLapsedStatements } from '#server/utils/role-prune'
import { openRegisterStatement } from '#server/utils/training-register-open'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// 0049: a conditional write and its audit row share one batch, so a change always has its trail
// and a write that changed nothing leaves none (the audit sweep's group B).

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
  database.batch([[`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`, ...Object.values(values)]])
}

const trail = (database: TestDatabase, action: string): { target: string, detail: string | null }[] =>
  rows(database, 'SELECT target, detail FROM audit_log WHERE action = ? ORDER BY target', action)

describe('editing a bar discount audits only the edit that landed (F-117)', () => {
  const edit = (database: TestDatabase, id: string, name: string): void => {
    const entry = auditEntry({ actorId: 'u-1', action: 'bar.discount.updated', target: `bar-discount:${id}`, detail: null })
    database.batch([
      boundStatement(database, renameDiscountStatement({ id, name, percent: 15, actorId: 'u-1' })),
      boundStatement(database, auditIfChanged(entry)),
    ])
  }

  test('a rename onto a name another discount holds changes nothing and writes no audit row', async () => {
    await withDatabase((database) => {
      insert(database, 'users', { id: 'u-1', email: 'bar@example.invalid', name: 'Bar' })
      insert(database, 'discounts', { id: 'd-1', name: 'Cast and crew', percent: 20 })
      insert(database, 'discounts', { id: 'd-2', name: 'Committee', percent: 10 })

      edit(database, 'd-2', 'cast and crew')
      expect(rows(database, 'SELECT name, percent FROM discounts WHERE id = ?', 'd-2')).toEqual([{ name: 'Committee', percent: 10 }])
      expect(trail(database, 'bar.discount.updated')).toEqual([])

      edit(database, 'd-2', 'Committee members')
      expect(rows(database, 'SELECT name, percent FROM discounts WHERE id = ?', 'd-2')).toEqual([{ name: 'Committee members', percent: 15 }])
      expect(trail(database, 'bar.discount.updated').map(row => row.target)).toEqual(['bar-discount:d-2'])
    })
  })
})

describe('opening a register audits the open that landed, once (G-115 criterion 4)', () => {
  const open = (database: TestDatabase, auditId: string): void => {
    const entry = { ...auditEntry({ actorId: 'u-1', action: 'register.opened', target: 'session:s-1', detail: null }), id: auditId }
    database.batch([
      boundStatement(database, openRegisterStatement('s-1', 'u-1', 1000)),
      boundStatement(database, auditIfChanged(entry)),
    ])
  }

  test('a second open, from another device, changes nothing and writes no second audit row', async () => {
    await withDatabase((database) => {
      insert(database, 'users', { id: 'u-1', email: 'trainer@example.invalid', name: 'A Trainer' })
      insert(database, 'training_sessions', { id: 's-1', held_on: '2027-01-14', starts_at: '19:00', ends_at: '21:00', capacity: 20, trainer_id: 'u-1' })

      open(database, 'a-1')
      open(database, 'a-2')
      expect(rows(database, 'SELECT register_opened_by AS by FROM training_sessions WHERE id = ?', 's-1')).toEqual([{ by: 'u-1' }])
      expect(trail(database, 'register.opened')).toHaveLength(1)
    })
  })
})

describe('pruning lapsed grants audits exactly the rows it deletes (A-119 criterion 4)', () => {
  test('each pruned grant has its trail row, and a grant still in date or permanent has neither', async () => {
    await withDatabase((database) => {
      for (const id of ['u-1', 'u-2', 'u-3']) insert(database, 'users', { id, email: `${id}@example.invalid`, name: id })
      insert(database, 'role_grants', { id: 'g-old', user_id: 'u-1', role: 'BAR_MANAGER', expires_at: 1000 })
      insert(database, 'role_grants', { id: 'g-older', user_id: 'u-2', role: 'FOH_MANAGER', expires_at: 500 })
      insert(database, 'role_grants', { id: 'g-recent', user_id: 'u-3', role: 'BAR_MANAGER', expires_at: 5000 })
      insert(database, 'role_grants', { id: 'g-permanent', user_id: 'u-3', role: 'ADMIN', expires_at: null })

      const { audit, prune } = pruneLapsedStatements(2000)
      database.batch([boundStatement(database, audit), boundStatement(database, prune)])

      expect(rows<{ id: string }>(database, 'SELECT id FROM role_grants ORDER BY id').map(row => row.id)).toEqual(['g-permanent', 'g-recent'])
      const pruned = trail(database, 'role.pruned')
      expect(pruned.map(row => row.target)).toEqual(['user:u-1', 'user:u-2'])
      expect(pruned.map(row => JSON.parse(row.detail!))).toEqual([{ role: 'BAR_MANAGER', expiresAt: 1000 }, { role: 'FOH_MANAGER', expiresAt: 500 }])

      // Nothing left to prune: neither the delete nor the trail finds a row.
      database.batch([boundStatement(database, audit), boundStatement(database, prune)])
      expect(trail(database, 'role.pruned')).toHaveLength(2)
    })
  })
})
