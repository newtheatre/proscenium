import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// G-102. What a member could take next is a query over held records and direct edges, computed on
// every read. The shapes below are what the route's SQL has to get right.

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
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    // The ladder: FOUNDATION opens DESK, which with RIG opens ADVANCED.
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-FOUND', 'TECH', 'MODULE', 'Foundation', 'ACTIVE'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-DESK', 'TECH', 'MODULE', 'Driving the desk', 'ACTIVE'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-RIG', 'TECH', 'MODULE', 'Rigging', 'ACTIVE'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-ADV', 'TECH', 'MODULE', 'Advanced', 'ACTIVE'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-DRAFT', 'TECH', 'MODULE', 'Not ready', 'DRAFT'],
    ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
      'TECH-OLD', 'TECH', 'MODULE', 'Retired', 'RETIRED'],
    ['INSERT INTO module_prerequisites (id, module_id, requires_id) VALUES (?, ?, ?)',
      'p1', 'TECH-DESK', 'TECH-FOUND'],
    ['INSERT INTO module_prerequisites (id, module_id, requires_id) VALUES (?, ?, ?)',
      'p2', 'TECH-ADV', 'TECH-DESK'],
    ['INSERT INTO module_prerequisites (id, module_id, requires_id) VALUES (?, ?, ?)',
      'p3', 'TECH-ADV', 'TECH-RIG'],
  ])
}

function award(database: TestDatabase, moduleId: string, columns: Record<string, unknown> = {}): void {
  const values: Record<string, unknown> = {
    id: `r-${moduleId}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'u1',
    module_id: moduleId,
    awarded_on: '2026-09-01',
    source: 'SIGNOFF',
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO training_records (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

// The query the route runs, kept here so the shape is asserted rather than described. Held is
// unrevoked and not yet at expiry, which is where expiring counts as held (G-101 criterion 3).
const NEXT = `
  select m.id from modules m
  where m.status = 'ACTIVE'
    and not exists (
      select 1 from training_records r
      where r.user_id = ?1 and r.module_id = m.id and r.revoked_at is null
        and (r.expires_on is null or r.expires_on > ?2)
    )
    and not exists (
      select 1 from module_prerequisites p
      join modules req on req.id = p.requires_id
      where p.module_id = m.id and req.kind != 'BRIEF'
        and not exists (
          select 1 from training_records held
          where held.user_id = ?1 and held.module_id = p.requires_id and held.revoked_at is null
            and (held.expires_on is null or held.expires_on > ?2)
        )
    )
  order by m.sort, m.id
`

const nextFor = (database: TestDatabase, today = '2026-09-02'): string[] =>
  rows<{ id: string }>(database, NEXT, 'u1', today).map(row => row.id)

describe('what a member could take next (G-102 criterion 1)', () => {
  test('a module with no prerequisites is open from the start', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(nextFor(database)).toEqual(['TECH-FOUND', 'TECH-RIG'])
    })
  })

  test('holding a prerequisite opens what it gates, and closes itself', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, 'TECH-FOUND')
      expect(nextFor(database)).toEqual(['TECH-DESK', 'TECH-RIG'])
    })
  })

  test('a module needs every direct prerequisite, not just one', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, 'TECH-FOUND')
      award(database, 'TECH-DESK')
      expect(nextFor(database)).toEqual(['TECH-RIG'])

      award(database, 'TECH-RIG')
      expect(nextFor(database)).toEqual(['TECH-ADV'])
    })
  })

  test('a draft and a retired module are never offered (criterion 5)', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(nextFor(database)).not.toContain('TECH-DRAFT')
      expect(nextFor(database)).not.toContain('TECH-OLD')
    })
  })
})

describe('the list follows the records, with nothing cached (G-102 criterion 4)', () => {
  test('an expiring prerequisite still opens what it gates, because expiring is held', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, 'TECH-FOUND', { expires_on: '2026-09-30' })
      expect(nextFor(database)).toContain('TECH-DESK')
      // Its own entry stays closed while it is still held, expiring or not.
      expect(nextFor(database)).not.toContain('TECH-FOUND')
    })
  })

  test('an expired prerequisite closes what it gated, and reopens itself', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, 'TECH-FOUND', { awarded_on: '2025-09-01', expires_on: '2026-09-01' })
      expect(nextFor(database)).toEqual(['TECH-FOUND', 'TECH-RIG'])
    })
  })

  test('revoking a record reopens the module on the next read', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, 'TECH-FOUND', { id: 'r-revocable' })
      expect(nextFor(database)).not.toContain('TECH-FOUND')

      database.batch([[
        `UPDATE training_records SET revoked_at = 1, revoked_by = 'u1', revoke_reason = 'Wrong person'
         WHERE id = 'r-revocable'`,
      ]])
      expect(nextFor(database)).toEqual(['TECH-FOUND', 'TECH-RIG'])
    })
  })

  test('a superseded record still counts, because the renewal is the one that is held', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, 'TECH-FOUND', { awarded_on: '2025-09-01', expires_on: '2026-09-01' })
      award(database, 'TECH-FOUND', { awarded_on: '2026-09-01', expires_on: '2027-09-01' })
      expect(nextFor(database)).toEqual(['TECH-DESK', 'TECH-RIG'])
    })
  })
})

// Criterion 2. The write path refuses an edge onto a brief, so this proves the read path is safe
// even if that guard is ever loosened: a brief can never be what blocks somebody.
describe('a brief never gates anything (G-102 criterion 2)', () => {
  test('an edge onto a brief does not keep a module off the list', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
          'TECH-BRIEF', 'TECH', 'BRIEF', 'Fire brief', 'ACTIVE'],
        ['INSERT INTO module_prerequisites (id, module_id, requires_id) VALUES (?, ?, ?)',
          'p-brief', 'TECH-RIG', 'TECH-BRIEF'],
      ])
      expect(nextFor(database)).toContain('TECH-RIG')
    })
  })

  test('a brief the member has not attended is itself something to do next', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
          'TECH-BRIEF', 'TECH', 'BRIEF', 'Fire brief', 'ACTIVE'],
      ])
      expect(nextFor(database)).toContain('TECH-BRIEF')
    })
  })
})
