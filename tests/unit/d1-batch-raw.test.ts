import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

// Pins the drizzle-orm patch (0067, upstream issue 2277): this must pass before the patch may be
// removed. `batch()` reaches for a `stmt` a raw statement has not got, so a bound one threw on D1.

interface Bound { sql: string, params: unknown[] }

// The narrow slice of D1 that drizzle's batch path touches, recording what it was handed.
function fakeD1(bound: Bound[]) {
  return {
    prepare(statement: string) {
      const made = {
        bind(...params: unknown[]) {
          bound.push({ sql: statement, params })
          return made
        },
      }
      return made
    },
    async batch(statements: unknown[]) {
      return statements.map(() => ({ results: [], success: true, meta: {} }))
    },
  }
}

describe('a raw statement with bound parameters survives a D1 batch (0067)', () => {
  test('db.run with a parameter does not throw and binds what it was given', async () => {
    const bound: Bound[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = drizzle(fakeD1(bound) as any)

    await db.batch([db.run(sql`INSERT INTO venues (id, name) VALUES (${'v1'}, ${'Repro House'})`)])

    expect(bound).toHaveLength(1)
    expect(bound[0]!.params).toEqual(['v1', 'Repro House'])
  })

  test('db.all with parameters comes back mapped rather than throwing', async () => {
    const bound: Bound[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = drizzle(fakeD1(bound) as any)

    const [rows] = await db.batch([db.all<{ id: string }>(sql`SELECT id FROM venues WHERE id = ${'v1'}`)])

    expect(rows).toEqual([])
    expect(bound[0]!.params).toEqual(['v1'])
  })

  test('a parameterless raw statement still goes through, as it always did', async () => {
    const bound: Bound[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = drizzle(fakeD1(bound) as any)

    await db.batch([db.run(sql`DELETE FROM venues`)])

    expect(bound[0]!.params).toEqual([])
  })
})
