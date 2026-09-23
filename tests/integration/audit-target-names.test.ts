import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { NAMED_TARGET_KINDS, auditTargetAt, auditTargetName } from '#server/utils/audit-targets'
import { erasureStatements } from '#shared/utils/erasure'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// The trail names its subject the way the rest of the console does, and says the raw target when
// there is nothing honest to say instead (J-103 criterion 6, 0006, 0011).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function entry(database: TestDatabase, id: string, target: string | null): void {
  database.batch([[
    'INSERT INTO audit_log (id, actor_id, action, target) VALUES (?, ?, ?, ?)',
    id, null, 'role.granted', target,
  ]])
}

interface Named { name: string | null, at: number | null }

function named(database: TestDatabase, id: string): Named {
  const statement = sql`SELECT ${auditTargetName} AS name, ${auditTargetAt} AS at FROM audit_log WHERE audit_log.id = ${id}`
  const [text, ...parameters] = boundStatement(database, statement)
  const [row] = rows<Named>(database, text, ...parameters)
  if (!row) throw new Error(`no entry ${id}`)
  return row
}

describe('a subject reads as its own name', () => {
  test('a person, a show, a performance, a venue and its till', async () => {
    await withDatabase((database) => {
      database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-1', 'u-1@example.invalid', 'Member One']])
      const tonight = tonightsPerformance(database, { venueName: 'The Studio' })

      entry(database, 'e-user', 'user:u-1')
      entry(database, 'e-show', `show:${tonight.showId}`)
      entry(database, 'e-performance', `performance:${tonight.performanceId}`)
      entry(database, 'e-venue', `venue:${tonight.venueId}`)
      entry(database, 'e-till', `till:${tonight.venueId}`)

      expect(named(database, 'e-user')).toEqual({ name: 'Member One', at: null })
      expect(named(database, 'e-show')).toEqual({ name: 'A Test Show', at: null })
      // A show has many performances, so the one meant is told apart by when it starts.
      expect(named(database, 'e-performance')).toEqual({ name: 'A Test Show', at: tonight.startsAt })
      expect(named(database, 'e-venue')).toEqual({ name: 'The Studio', at: null })
      expect(named(database, 'e-till')).toEqual({ name: 'The Studio', at: null })
    })
  })

  test('a season, a department, a module and a bar variant under its product', async () => {
    await withDatabase((database) => {
      database.batch([
        ['INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', 's-1', 'Autumn 2026', '2026-09-01', '2026-12-31'],
        ['INSERT INTO departments (code, name) VALUES (?, ?)', 'LX', 'Lighting'],
        ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'm-1', 'LX', 'MODULE', 'Working at height'],
        ['INSERT INTO bar_categories (id, name) VALUES (?, ?)', 'c-1', 'Beer'],
        ['INSERT INTO bar_products (id, category_id, name) VALUES (?, ?, ?)', 'p-1', 'c-1', 'House lager'],
        ['INSERT INTO product_variants (id, product_id, serving_kind, label) VALUES (?, ?, ?, ?)', 'v-1', 'p-1', 'PINT', 'Pint'],
      ])
      entry(database, 'e-season', 'season:s-1')
      entry(database, 'e-department', 'department:LX')
      entry(database, 'e-module', 'module:m-1')
      entry(database, 'e-product', 'bar-product:p-1')
      entry(database, 'e-variant', 'bar-variant:v-1')

      expect(named(database, 'e-season').name).toBe('Autumn 2026')
      expect(named(database, 'e-department').name).toBe('Lighting')
      expect(named(database, 'e-module').name).toBe('Working at height')
      expect(named(database, 'e-product').name).toBe('House lager')
      expect(named(database, 'e-variant').name).toBe('House lager, Pint')
    })
  })

  test('an erased person reads as their tombstone, never their old name', async () => {
    await withDatabase((database) => {
      database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-gone', 'u-gone@example.invalid', 'Somebody Real']])
      entry(database, 'e-gone', 'user:u-gone')
      database.batch(erasureStatements('u-gone', 1_780_000_000).map(statement => boundStatement(database, statement)))

      expect(named(database, 'e-gone').name).not.toContain('Somebody')
      expect(named(database, 'e-gone').name).toBe('Deleted user')
    })
  })
})

describe('a subject with nothing readable says its raw target, never a guess', () => {
  test('a kind with no name, a deleted subject, no target and a lookalike prefix all read as nothing', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      entry(database, 'e-feedback', 'feedback:f-1')
      entry(database, 'e-deleted', 'show:no-such-show')
      entry(database, 'e-none', null)
      entry(database, 'e-bare', tonight.showId)
      // A prefix that merely begins with a named kind is its own kind, not that one.
      entry(database, 'e-lookalike', `show-category:${tonight.showId}`)

      for (const id of ['e-feedback', 'e-deleted', 'e-none', 'e-bare', 'e-lookalike']) {
        expect(named(database, id)).toEqual({ name: null, at: null })
      }
    })
  })

  test('every named kind resolves against the real schema', async () => {
    await withDatabase((database) => {
      for (const kind of NAMED_TARGET_KINDS) {
        entry(database, `e-${kind}`, `${kind}:missing`)
        expect(named(database, `e-${kind}`)).toEqual({ name: null, at: null })
      }
    })
  })
})

describe('the lookup is fixed in size, whatever the page holds (0006)', () => {
  test('naming a subject binds no parameter at all', async () => {
    await withDatabase((database) => {
      const [, ...nameParameters] = boundStatement(database, sql`SELECT ${auditTargetName} FROM audit_log`)
      const [, ...atParameters] = boundStatement(database, sql`SELECT ${auditTargetAt} FROM audit_log`)
      expect(nameParameters).toEqual([])
      expect(atParameters).toEqual([])
    })
  })
})
