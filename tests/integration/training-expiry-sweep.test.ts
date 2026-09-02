import { describe, expect, test } from 'bun:test'
import { claimFor, digestClaimFor } from '#shared/utils/training-expiry'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// G-125's database half: the ledger is what stops a warning being sent twice, and it is a unique
// index that enforces it rather than a read followed by a write (criterion 1, 0006).

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
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'one@example.invalid', 'A Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u2', 'two@example.invalid', 'Another'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-1', 'TECH', 'MODULE', 'Working at height', 'ACTIVE'],
  ])
}

function logged(database: TestDatabase, columns: Record<string, unknown>): void {
  const values: Record<string, unknown> = {
    id: `n-${Math.random().toString(36).slice(2, 10)}`,
    user_id: 'u1',
    type: 'training.expiry.window',
    channel: 'EMAIL',
    status: 'SENT',
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO notification_log (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

describe('the ledger holds the claim (G-125 criterion 1)', () => {
  test('two rows cannot hold the same claim', async () => {
    await withDatabase((database) => {
      seed(database)
      logged(database, { claim: claimFor('window', 'r1') })
      expect(() => logged(database, { claim: claimFor('window', 'r1') })).toThrow()
      expect(rows(database, 'SELECT id FROM notification_log')).toHaveLength(1)
    })
  })

  test('the two windows are independent, so one record can hold both claims', async () => {
    await withDatabase((database) => {
      seed(database)
      logged(database, { claim: claimFor('window', 'r1') })
      logged(database, { claim: claimFor('final', 'r1'), type: 'training.expiry.final' })
      expect(rows(database, 'SELECT id FROM notification_log')).toHaveLength(2)
    })
  })

  test('a claim is per record, so two people warned about their own records both send', async () => {
    await withDatabase((database) => {
      seed(database)
      logged(database, { claim: claimFor('window', 'r1') })
      logged(database, { user_id: 'u2', claim: claimFor('window', 'r2') })
      expect(rows(database, 'SELECT id FROM notification_log')).toHaveLength(2)
    })
  })

  // The index is partial, so everything the ledger records that is not a claim still writes
  // freely: rooms reminders and every other message have no claim at all.
  test('any number of rows may carry no claim', async () => {
    await withDatabase((database) => {
      seed(database)
      logged(database, { type: 'room.booking.reminder' })
      logged(database, { type: 'room.booking.reminder' })
      logged(database, { type: 'room.booking.reminder' })
      expect(rows(database, 'SELECT id FROM notification_log WHERE claim IS NULL')).toHaveLength(3)
    })
  })

  test('a digest claim is per person and month', async () => {
    await withDatabase((database) => {
      seed(database)
      logged(database, { type: 'training.expiry.digest', claim: digestClaimFor('u1', '2026-09') })
      expect(() => logged(database, {
        type: 'training.expiry.digest', claim: digestClaimFor('u1', '2026-09'),
      })).toThrow()

      // October is a different month, and a different person is a different digest.
      logged(database, { type: 'training.expiry.digest', claim: digestClaimFor('u1', '2026-10') })
      logged(database, { user_id: 'u2', type: 'training.expiry.digest', claim: digestClaimFor('u2', '2026-09') })
      expect(rows(database, 'SELECT id FROM notification_log')).toHaveLength(3)
    })
  })
})

describe('what the ledger carries about a message (G-125)', () => {
  test('a warning names the record it was about', async () => {
    await withDatabase((database) => {
      seed(database)
      logged(database, { record_id: 'r1', claim: claimFor('window', 'r1') })
      expect(rows<{ recordId: string }>(
        database, 'SELECT record_id recordId FROM notification_log WHERE claim = ?', claimFor('window', 'r1'),
      )[0]?.recordId).toBe('r1')
    })
  })

  // No foreign key on the refs: the ledger outlives what it refers to, and a message sent is a
  // fact about the past that a later deletion must not rewrite.
  test('a ledger row survives the record it names going away', async () => {
    await withDatabase((database) => {
      seed(database)
      logged(database, { record_id: 'r-gone', claim: claimFor('window', 'r-gone') })
      expect(rows(database, 'SELECT id FROM notification_log WHERE record_id = ?', 'r-gone')).toHaveLength(1)
    })
  })

  test('erasing the person leaves the message recorded, without them', async () => {
    await withDatabase((database) => {
      seed(database)
      logged(database, { record_id: 'r1', claim: claimFor('window', 'r1') })
      database.batch([['DELETE FROM users WHERE id = ?', 'u1']])

      const remaining = rows<{ userId: string | null }>(database, 'SELECT user_id userId FROM notification_log')
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.userId).toBeNull()
    })
  })
})
