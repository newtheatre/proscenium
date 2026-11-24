// A D1Database over a practice store (proof P-PM-1): the same prepare, bind, run, all, first, raw
// and batch, so the kit and every module's services run against a store with nothing changed.
// Values bind as D1 binds them, and results come back in D1's shape, meta included.

export interface StoreStatement { sql: string, params: unknown[] }
export interface StoreAnswer {
  columns: string[]
  rows: unknown[][]
  changes: number
  lastRowId: number
  rowsRead: number
  rowsWritten: number
  duration: number
}

/** What the store's Durable Object stub offers: one statement, or a batch that commits whole. */
export interface StoreStub {
  query: (statement: StoreStatement) => Promise<StoreAnswer>
  batch: (statements: StoreStatement[]) => Promise<StoreAnswer[]>
}

function bindable(value: unknown): unknown {
  if (value === undefined) throw new TypeError('D1_TYPE_ERROR: Type \'undefined\' not supported for value \'undefined\'')
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Uint8Array) return value.slice().buffer
  if (Array.isArray(value)) return new Uint8Array(value as number[]).buffer
  return value
}

function result<T>(answer: StoreAnswer): D1Result<T> {
  const results = answer.rows.map(row => Object.fromEntries(answer.columns.map((c, i) => [c, row[i]])) as T)
  return {
    results,
    success: true,
    meta: { duration: answer.duration, size_after: 0, rows_read: answer.rowsRead, rows_written: answer.rowsWritten, last_row_id: answer.lastRowId, changed_db: answer.rowsWritten > 0, changes: answer.changes },
  } as D1Result<T>
}

class StoreStatementImpl {
  constructor(readonly store: StoreStub, readonly sql: string, readonly params: unknown[] = []) {}

  bind(...values: unknown[]): StoreStatementImpl {
    return new StoreStatementImpl(this.store, this.sql, values.map(bindable))
  }

  get statement(): StoreStatement {
    return { sql: this.sql, params: this.params }
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return result<T>(await this.store.query(this.statement))
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.run<T>()
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = (await this.run<Record<string, unknown>>()).results[0]
    if (!row) return null
    if (column === undefined) return row as T
    if (!(column in row)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`)
    return row[column] as T
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    const answer = await this.store.query(this.statement)
    return (options?.columnNames ? [answer.columns, ...answer.rows] : answer.rows) as T[]
  }
}

/** A D1Database whose every statement runs in the given practice store. */
export function storeDatabase(store: StoreStub): D1Database {
  const db = {
    prepare: (sql: string) => new StoreStatementImpl(store, sql),
    async batch<T = unknown>(statements: StoreStatementImpl[]): Promise<D1Result<T>[]> {
      return (await store.batch(statements.map(s => s.statement))).map(a => result<T>(a))
    },
    async exec(sql: string): Promise<D1ExecResult> {
      const started = performance.now()
      const statements = sql.split('\n').map(s => s.trim()).filter(Boolean)
      for (const statement of statements) await store.query({ sql: statement, params: [] })
      return { count: statements.length, duration: performance.now() - started }
    },
    dump: async () => {
      throw new Error('A practice store cannot be dumped.')
    },
    withSession: () => db,
  }
  return db as unknown as D1Database
}
