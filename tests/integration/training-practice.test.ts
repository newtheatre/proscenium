import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// G-126. A practice window is access control, so the shapes that stop two of them existing, and
// the shape that stops a target key moving under a consumer, are the database's job.

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
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'BAR', 'Bar'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'BAR-101', 'BAR', 'MODULE', 'Working the till', 'ACTIVE'],
    ['INSERT INTO practice_targets (key, name, window_hours) VALUES (?, ?, ?)', 'till-sandbox', 'Till sandbox', 72],
  ])
}

function openWindow(database: TestDatabase, columns: Record<string, unknown> = {}): void {
  const values: Record<string, unknown> = {
    id: `w-${Math.random().toString(36).slice(2, 10)}`,
    target_key: 'till-sandbox',
    user_id: 'u1',
    session_id: 's1',
    opens_at: 1000,
    expires_at: 9000,
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO practice_windows (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

// Criterion 2, and the old estate's actual bug: opening one register twice opened two windows.
describe('one window per person, target and session (G-126 criterion 2)', () => {
  test('the same register cannot open two windows for one person', async () => {
    await withDatabase((database) => {
      seed(database)
      openWindow(database)
      expect(() => openWindow(database)).toThrow()
      expect(rows(database, 'SELECT id FROM practice_windows')).toHaveLength(1)
    })
  })

  test('two people on one register each get one', async () => {
    await withDatabase((database) => {
      seed(database)
      openWindow(database)
      openWindow(database, { user_id: 'u2' })
      expect(rows(database, 'SELECT id FROM practice_windows')).toHaveLength(2)
    })
  })

  test('a later session opens a fresh window for the same person', async () => {
    await withDatabase((database) => {
      seed(database)
      openWindow(database, { session_id: 's1' })
      openWindow(database, { session_id: 's2' })
      expect(rows(database, 'SELECT id FROM practice_windows')).toHaveLength(2)
    })
  })

  // The index is partial, so a window opened by hand carries no session and does not contend
  // with the register's claim. Extending rather than duplicating is the write path's job.
  test('windows opened by hand carry no session and are not constrained', async () => {
    await withDatabase((database) => {
      seed(database)
      openWindow(database, { session_id: null })
      openWindow(database, { session_id: null })
      expect(rows(database, `SELECT id FROM practice_windows WHERE session_id IS NULL`)).toHaveLength(2)
    })
  })
})

describe('what a target is (G-126 criterion 1)', () => {
  test('a target maps to any number of modules, each named once', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        [`INSERT INTO practice_target_modules (id, target_key, module_id) VALUES ('m1', 'till-sandbox', 'BAR-101')`],
      ])
      expect(() => database.batch([
        [`INSERT INTO practice_target_modules (id, target_key, module_id) VALUES ('m2', 'till-sandbox', 'BAR-101')`],
      ])).toThrow()
    })
  })

  test('a window length outside one hour to a year is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => database.batch([
        [`INSERT INTO practice_targets (key, name, window_hours) VALUES ('none', 'None', 0)`],
      ])).toThrow()
      expect(() => database.batch([
        [`INSERT INTO practice_targets (key, name, window_hours) VALUES ('forever', 'Forever', 8761)`],
      ])).toThrow()
    })
  })

  test('retiring a module takes its mapping, and leaves the target standing', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        [`INSERT INTO practice_target_modules (id, target_key, module_id) VALUES ('m1', 'till-sandbox', 'BAR-101')`],
        [`DELETE FROM modules WHERE id = 'BAR-101'`],
      ])
      expect(rows(database, 'SELECT id FROM practice_target_modules')).toHaveLength(0)
      expect(rows(database, 'SELECT key FROM practice_targets')).toHaveLength(1)
    })
  })
})

describe('a window outlives what opened it (G-126)', () => {
  test('the session reference carries no foreign key, so a window survives its session', async () => {
    await withDatabase((database) => {
      seed(database)
      openWindow(database, { session_id: 'gone-entirely' })
      expect(rows(database, 'SELECT id FROM practice_windows')).toHaveLength(1)
    })
  })

  test('erasing the person takes their windows, because the window is access and not history', async () => {
    await withDatabase((database) => {
      seed(database)
      openWindow(database)
      database.batch([['DELETE FROM users WHERE id = ?', 'u1']])
      expect(rows(database, 'SELECT id FROM practice_windows')).toHaveLength(0)
    })
  })
})
