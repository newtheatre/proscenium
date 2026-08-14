import type { SQL, SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { z } from 'zod/v4'

/**
 * Server-side pagination for list endpoints (ADR-0005).
 *
 * The contract: a list endpoint accepts `page`, `limit` and optionally `q`, and
 * always returns a `Paginated<T>` envelope rather than a bare array, so a
 * client cannot mistake one page for the whole set.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  /** Capped so a caller cannot ask for the whole table by passing limit=99999. */
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  q: z.string().trim().max(100).optional(),
})

export type PaginationQuery = z.infer<typeof paginationSchema>

// `Paginated<T>` is declared in `shared/types/pagination.ts` and auto-imported
// on both sides. It is not re-exported from here: two auto-imports of one name
// is a build warning, and the client needs the type as much as the handler does.

/** Rows to skip for the requested page. */
export function offsetFor({ page, limit }: { page: number, limit: number }): number {
  return (page - 1) * limit
}

/** Wrap a page of rows in the standard envelope. */
export function paginated<T>(rows: T[], total: number, { page, limit }: { page: number, limit: number }): Paginated<T> {
  return { rows, total, page, limit }
}

/**
 * Case-insensitive "contains" match on a text column.
 *
 * Emits its own `ESCAPE` clause: Drizzle's `like()` renders a bare
 * `col like ?` and SQLite has no default escape character, so escaping `%`
 * and `_` without it matches the backslashes literally (ADR-0005).
 */
export function likeInsensitive(column: SQLWrapper, q: string): SQL {
  const term = `%${q.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%`
  return sql`lower(${column}) like ${term} escape '\\'`
}
