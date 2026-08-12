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
 * Escape a user-supplied search term for use in a SQL LIKE pattern, so `%` and
 * `_` are matched literally rather than acting as wildcards. Pair with
 * `ESCAPE '\'` in the query.
 */
export function likeTerm(q: string): string {
  return `%${q.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%`
}
