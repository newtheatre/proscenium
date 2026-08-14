import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, gt, gte, inArray, lte, ne } from 'drizzle-orm'
import { z } from 'zod/v4'
import { listShows } from '~~/shared/utils/abilities'

const querySchema = paginationSchema.omit({ limit: true, q: true }).extend({
  /** `YYYY-MM-DD`, inclusive, resolved in Europe/London. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * `YYYY-MM-DD`. Returns the `limit` performances *closest to* that date,
   * roughly half either side, instead of a page. See the docblock.
   */
  near: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  showId: z.string().optional(),
  /**
   * Exact match. Omitted, cancelled performances are excluded and the rest are
   * returned — a sensible default for "what is scheduled", but note that DRAFT
   * ones are in that set: pass `status=ON_SALE` for "what is actually selling".
   */
  status: z.enum(['DRAFT', 'ON_SALE', 'CANCELLED']).optional(),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

/**
 * GET /api/performances — a flat, chronological list of performances. Staff only.
 *
 * Performances previously existed only nested under a show, so the box office —
 * which wants a chronological list and nothing else — had to download every show
 * in the archive, 498 of them with 1,304 performances, to build a navigator.
 *
 * ## `near`, and why it exists
 *
 * A date window is the wrong primitive for "show me what's on around now". The
 * theatre goes quiet over the summer, so any fixed window is sometimes empty,
 * and an empty navigator on the door is worse than an old one. `near` asks for
 * the performances *closest to* a date — half before, half after — so it returns
 * something whenever anything exists at all, and the caller needs no fallback.
 *
 * In `near` mode the response is one centred window rather than a page: `page`
 * is always 1 and `total` is the size of that window. Use `from`/`to` when you
 * genuinely want to page a range.
 *
 * ## Bound parameters
 *
 * D1 allows 100 per statement. The page's own ids are never bound: ticket counts
 * scope through a subquery over the time span the page covers, which costs two
 * parameters whether the page holds five performances or two hundred. See
 * `countOccupiedSeats`.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listShows)

  const { from, to, near, showId, status, order, page, limit }
    = await getValidatedQuery(event, querySchema.parse)

  const filters = []
  if (showId) filters.push(eq(schema.performances.showId, showId))
  if (status) filters.push(eq(schema.performances.status, status))
  else filters.push(ne(schema.performances.status, 'CANCELLED'))
  if (from) filters.push(gte(schema.performances.startsAt, validityStart(from)))
  if (to) filters.push(lte(schema.performances.startsAt, validityEnd(to)))

  const where = filters.length ? and(...filters) : undefined

  const [totalRow] = await db.select({ n: count() }).from(schema.performances).where(where)
  const total = totalRow?.n ?? 0
  if (total === 0) return paginated([], 0, { page, limit })

  const withRelations = {
    venue: { columns: { id: true, name: true, capacity: true } },
    show: { columns: { id: true, title: true, slug: true, status: true } },
  } as const

  let rows
  if (near) {
    // Half either side of the pivot, then stitched back into one ascending run.
    // Two bounded queries rather than one clever window function, because SQLite
    // in D1 and Drizzle's relational builder do not make the clever version any
    // more readable.
    const pivot = validityEnd(near)

    // Each side asks for the full limit so it can cover for the other. Ask for
    // half each and a pivot outside the season returns half a window: on the
    // door in September, "near today" would show four performances when twelve
    // were available and the navigator would look broken.
    const [before, after] = await Promise.all([
      db.query.performances.findMany({
        where: () => (where ? and(where, lte(schema.performances.startsAt, pivot)) : lte(schema.performances.startsAt, pivot)),
        with: withRelations,
        orderBy: [desc(schema.performances.startsAt)],
        limit,
      }),
      db.query.performances.findMany({
        where: () => (where ? and(where, gt(schema.performances.startsAt, pivot)) : gt(schema.performances.startsAt, pivot)),
        with: withRelations,
        orderBy: [asc(schema.performances.startsAt)],
        limit,
      }),
    ])

    const takeBefore = Math.min(before.length, Math.max(Math.ceil(limit / 2), limit - after.length))
    const takeAfter = Math.min(after.length, limit - takeBefore)

    rows = [...before.slice(0, takeBefore).reverse(), ...after.slice(0, takeAfter)]
  }
  else {
    rows = await db.query.performances.findMany({
      where: () => where,
      with: withRelations,
      orderBy: [order === 'desc' ? desc(schema.performances.startsAt) : asc(schema.performances.startsAt)],
      limit,
      offset: offsetFor({ page, limit }),
    })
  }

  if (rows.length === 0) return paginated([], total, { page, limit })

  // Seats occupied, by the shared rule so the box office agrees with what the
  // booking path allows. Scoped by the time span this page covers rather than by
  // its ids: two bound parameters instead of up to two hundred. It counts a few
  // performances we are not returning, which is harmless — only the ids below
  // are ever read out of the map.
  const spanStart = rows.reduce((min, r) => (r.startsAt < min ? r.startsAt : min), rows[0]!.startsAt)
  const spanEnd = rows.reduce((max, r) => (r.startsAt > max ? r.startsAt : max), rows[0]!.startsAt)

  const performancesInSpan = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(and(
      gte(schema.performances.startsAt, spanStart),
      lte(schema.performances.startsAt, spanEnd),
    ))

  const ticketCountMap = await countOccupiedSeats(
    inArray(schema.tickets.performanceId, performancesInSpan),
  )

  const shaped = rows.map(performance => ({
    ...performance,
    ticketsSold: ticketCountMap.get(performance.id) ?? 0,
  }))

  return near
    ? paginated(shaped, shaped.length, { page: 1, limit })
    : paginated(shaped, total, { page, limit })
})
