import type { SQL, SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { z } from 'zod/v4'

/**
 * Server-side pagination for list endpoints.
 *
 * Every admin list used to download its whole table and paginate in the
 * browser. That was fine at a few hundred rows; after the legacy import the
 * reservations list alone was ~30,000 rows and ~18 MB of JSON, built inside a
 * Worker with a 128 MB memory ceiling. D1 also bills by rows read.
 *
 * The contract: a list endpoint accepts `page`, `limit` and optionally `q`, and
 * always returns a `Paginated<T>` envelope rather than a bare array — so a
 * client can never mistake one page for the whole set.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  /** Capped so a caller cannot ask for the whole table by passing limit=99999. */
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  q: z.string().trim().max(100).optional(),
})

export type PaginationQuery = z.infer<typeof paginationSchema>

export interface Paginated<T> {
  rows: T[]
  total: number
  page: number
  limit: number
}

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
 * Emits the `ESCAPE` clause itself, which is the whole point. There used to be
 * a `likeTerm()` that backslash-escaped `%` and `_` and told callers to "pair
 * with `ESCAPE '\'`" — but Drizzle's `like()` renders a bare `col like ?`, and
 * SQLite has no default escape character, so the backslashes were matched as
 * literal characters. Searching for an address like `john_smith@nott.ac.uk`
 * looked for a backslash that no row contains and returned nothing at all:
 * the box office was told the booking did not exist. Underscores are common in
 * email local parts and the failure was completely silent.
 */
export function likeInsensitive(column: SQLWrapper, q: string): SQL {
  const term = `%${q.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%`
  return sql`lower(${column}) like ${term} escape '\\'`
}
