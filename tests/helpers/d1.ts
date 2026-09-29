import type { Database } from 'bun:sqlite'
import type { TestDatabase } from './database'

// A D1 binding over a test database, so `@nuxthub/db` runs a server function end to end the way
// production does, batch results included. One binding for the process; each test points it.

interface D1Result { results: unknown[], success: true, meta: { changes: number } }

let current: Database | null = null

function open(): Database {
  if (!current) throw new Error('Call bindD1() with a test database before reaching the db')
  return current
}

class Statement {
  constructor(private readonly query: string, private readonly params: unknown[] = []) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.query, params)
  }

  // Every statement runs through all(), which returns its rows and runs a write that has none.
  execute(): D1Result {
    const database = open()
    const results = database.prepare(this.query).all(...this.params as never[])
    const { changes } = database.prepare('SELECT changes() AS changes').get() as { changes: number }
    return { results, success: true, meta: { changes } }
  }

  async all(): Promise<D1Result> {
    return this.execute()
  }

  async run(): Promise<D1Result> {
    return this.execute()
  }

  async raw(): Promise<unknown[][]> {
    return open().prepare(this.query).values(...this.params as never[])
  }
}

// All or nothing, as D1's own batch is (0001).
const binding = {
  prepare: (query: string) => new Statement(query),
  batch: async (statements: Statement[]) => open().transaction(() => statements.map(statement => statement.execute()))(),
}

export function bindD1(database: TestDatabase): void {
  current = database.raw
  const globals = globalThis as { __env__?: Record<string, unknown> }
  globals.__env__ = { ...globals.__env__, DB: binding }
}
