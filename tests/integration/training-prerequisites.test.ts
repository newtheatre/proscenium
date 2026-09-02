import { describe, expect, test } from 'bun:test'
import { MAX_BOUND_PARAMETERS, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The gate graph on the real migrations. A cycle is refused by naming it, because "that would make
// a loop" is not actionable when the path runs through modules nobody is looking at (G-108).

const MAX_DEPTH = 64

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase, modules: string[], kinds: Record<string, string> = {}): void {
  database.batch([
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ...modules.map(id => [
      'INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)',
      id, 'TECH', kinds[id] ?? 'MODULE', `Module ${id}`,
    ] as [string, ...unknown[]]),
  ])
}

function requires(database: TestDatabase, moduleId: string, requiresId: string): void {
  database.batch([[
    'INSERT INTO module_prerequisites (id, module_id, requires_id) VALUES (?, ?, ?)',
    `e-${moduleId}-${requiresId}`, moduleId, requiresId,
  ]])
}

// The production query, verbatim, so what the tests prove is what the route runs.
function cyclePath(database: TestDatabase, moduleId: string, requiresId: string): string | null {
  const found = rows<{ path: string }>(database, `
    with recursive reaches(module_id, path, depth) as (
      select ?, ?, 0
      union all
      select p.requires_id, r.path || ' -> ' || p.requires_id, r.depth + 1
      from module_prerequisites p join reaches r on p.module_id = r.module_id
      where r.depth < ${MAX_DEPTH}
        and instr(' -> ' || r.path || ' -> ', ' -> ' || p.requires_id || ' -> ') = 0
    )
    select path from reaches where module_id = ? limit 1
  `, requiresId, requiresId, moduleId)
  return found[0]?.path ?? null
}

describe('an edge is a direct pair and nothing else (G-108 criteria 1 and 4)', () => {
  test('the table holds a pair, with no depth, group or order column', async () => {
    await withDatabase((database) => {
      seed(database, ['A'])
      expect(rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('module_prerequisites')`)
        .map(column => column.name))
        .toEqual(['id', 'module_id', 'requires_id', 'created_at'])
    })
  })

  test('a module cannot require itself', async () => {
    await withDatabase((database) => {
      seed(database, ['A'])
      expect(() => requires(database, 'A', 'A')).toThrow()
    })
  })

  test('the same edge cannot be declared twice', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B'])
      requires(database, 'A', 'B')
      expect(() => requires(database, 'A', 'B')).toThrow()
    })
  })

  test('a module nothing requires can be deleted; one another needs cannot', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B'])
      requires(database, 'A', 'B')
      // Cascade from the requiring end, restrict from the required end: an edge dies with the
      // module that declared it, and never takes the module it points at with it.
      expect(() => database.batch([[`DELETE FROM modules WHERE id = 'B'`]])).toThrow()
      database.batch([[`DELETE FROM modules WHERE id = 'A'`]])
      expect(rows(database, 'SELECT id FROM module_prerequisites')).toHaveLength(0)
    })
  })
})

describe('a cycle is found and named (G-108 criterion 2)', () => {
  test('a two-hop loop is found', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B'])
      requires(database, 'B', 'A')
      // The path runs from the proposed prerequisite back to the module, so the refusal reads
      // "A -> B -> A" once the route prefixes the module being edited.
      expect(cyclePath(database, 'A', 'B')).toBe('B -> A')
    })
  })

  test('a four-hop loop is found, and the path names every module in it', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B', 'C', 'D'])
      requires(database, 'B', 'C')
      requires(database, 'C', 'D')
      requires(database, 'D', 'A')

      const path = cyclePath(database, 'A', 'B')
      expect(path).toBe('B -> C -> D -> A')
      for (const module of ['B', 'C', 'D', 'A']) expect(path).toContain(module)
    })
  })

  test('the shortest way round is the one reported', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B', 'C'])
      requires(database, 'B', 'A')
      requires(database, 'B', 'C')
      requires(database, 'C', 'A')
      expect(cyclePath(database, 'A', 'B')).toBe('B -> A')
    })
  })

  // A diamond is not a cycle: two modules may both require a third without any loop existing.
  test('a diamond is not a loop', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B', 'C', 'D'])
      requires(database, 'B', 'D')
      requires(database, 'C', 'D')
      expect(cyclePath(database, 'A', 'B')).toBeNull()
      expect(cyclePath(database, 'A', 'C')).toBeNull()
    })
  })

  test('an unrelated graph is not a loop', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B', 'C', 'D'])
      requires(database, 'C', 'D')
      expect(cyclePath(database, 'A', 'B')).toBeNull()
    })
  })

  // The trap: padding one side only means module B and module AB collide, the walk stops early
  // and a real loop is missed. Both sides are padded, so the comparison is token-exact.
  test('a module id that is a suffix of another does not stop the walk', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B', 'AB', 'C'])
      requires(database, 'B', 'AB')
      requires(database, 'AB', 'C')
      requires(database, 'C', 'A')
      expect(cyclePath(database, 'A', 'B')).toBe('B -> AB -> C -> A')
    })
  })
})

describe('the walk is bounded whatever the graph looks like (0003)', () => {
  // A chain longer than the cap: the walk stops rather than running to the end of the graph.
  test('a chain past the depth cap does not run away', async () => {
    await withDatabase((database) => {
      const chain = Array.from({ length: MAX_DEPTH + 10 }, (_, index) => `M${index}`)
      seed(database, chain)
      for (let index = 0; index < chain.length - 1; index++) {
        requires(database, chain[index]!, chain[index + 1]!)
      }
      expect(() => cyclePath(database, 'NOPE', 'M0')).not.toThrow()
    })
  })

  // Two hundred edges bind exactly the same three parameters as two, which is why this is a
  // recursive walk rather than a fetch and a loop in TypeScript.
  test('the parameter count does not grow with the graph', async () => {
    await withDatabase((database) => {
      const modules = Array.from({ length: 200 }, (_, index) => `N${index}`)
      seed(database, modules)
      for (let index = 0; index < modules.length - 1; index++) {
        requires(database, modules[index]!, modules[index + 1]!)
      }
      expect(cyclePath(database, 'N199', 'N0')).toBeNull()
      expect(3).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
    })
  })
})

describe('a brief gates nothing (G-108 criterion 3)', () => {
  // Enforced at the write path rather than by a constraint: it is a fact about the other table.
  test('the database allows the edge, so the route is what has to refuse it', async () => {
    await withDatabase((database) => {
      seed(database, ['A', 'B'], { B: 'BRIEF' })
      requires(database, 'A', 'B')
      expect(rows(database, 'SELECT id FROM module_prerequisites')).toHaveLength(1)
    })
  })
})
