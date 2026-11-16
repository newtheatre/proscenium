// Reading the database. Writes go through a unit of work (unit.ts); reads use Drizzle directly.
import { drizzle } from 'drizzle-orm/d1'
import { SQL } from 'drizzle-orm'
import { useContext } from './context'

export type Db = ReturnType<typeof drizzle>

/** The Drizzle database for this request. Use it to read, and to build statements for a unit. */
export function useDb(): Db {
  const context = useContext()
  return (context.cache.db as Db | undefined) ?? (context.cache.db = drizzle(context.env.DB as any))
}

export interface Statement { sql: string, params: unknown[] }

/** A query builder, an sql`` fragment or a plain { sql, params }, as one statement. */
export type Writable = { toSQL: () => { sql: string, params: unknown[] } } | SQL | Statement

export function toStatement(query: Writable): Statement {
  if (query instanceof SQL) return (useDb() as any).dialect.sqlToQuery(query)
  if (typeof (query as any).toSQL === 'function') {
    const { sql, params } = (query as any).toSQL()
    return { sql, params }
  }
  const s = query as Statement
  if (typeof s.sql === 'string' && Array.isArray(s.params)) return s
  throw new Error('A unit of work takes a Drizzle query, an sql`` fragment or { sql, params }')
}

/** D1 takes null, numbers, strings and buffers. */
export function bindable(params: unknown[]): unknown[] {
  return params.map(p => p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p instanceof Date ? p.getTime() : p)
}

export function prepare(db: D1Database, statement: Statement): D1PreparedStatement {
  return db.prepare(statement.sql).bind(...bindable(statement.params))
}

/** Runs one read with plain SQL and returns its rows. */
export async function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await useContext().env.DB.prepare(sql).bind(...bindable(params)).all<T>()
  return result.results
}

export async function first<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | null> {
  return (await useContext().env.DB.prepare(sql).bind(...bindable(params)).first<T>()) ?? null
}
