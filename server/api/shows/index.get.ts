import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { listShows } from '~~/shared/utils/abilities'

/**
 * The four disjoint slices of the archive the admin UI navigates by.
 *
 * They partition every show exactly once, which is what lets the shows page show
 * a count per tab without double-counting or losing one:
 *  - `draft`    — not published, whatever its dates
 *  - `current`  — published, and the run spans today
 *  - `upcoming` — published, and the run has not started
 *  - `archive`  — published, and the run has finished (or there are no dates yet)
 *
 * `active` is `current ∪ upcoming`, so "now and next" is one request rather than
 * two. `all` applies no scope predicate at all.
 */
const SCOPES = ['all', 'active', 'current', 'upcoming', 'archive', 'draft'] as const

const querySchema = paginationSchema.omit({ limit: true }).extend({
  scope: z.enum(SCOPES).optional().default('all'),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  /** `YYYY-MM-DD`; matches shows with a performance inside the window. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** `tree` nests performances; `options` returns the bare minimum for a picker. */
  view: z.enum(['tree', 'options']).optional().default('tree'),
  sort: z.enum(['run', 'title']).optional().default('run'),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

/**
 * A `tree` page is capped well below D1's limit on purpose. The page's own show
 * ids are the one thing bound as a list (step 4 below); 50 of those plus the ~11
 * a fully-loaded filter costs leaves real headroom under 100. A cap of 100 would
 * not.
 */
const MAX_TREE_LIMIT = 50
const MAX_OPTIONS_LIMIT = 500

/** `performances.startsAt` is `mode: 'timestamp'` — unix **seconds**, not ms. */
function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

/**
 * GET /api/shows — list shows. Staff only; the public uses /api/whats-on.
 *
 * Always returns the standard `{ rows, total, page, limit }` envelope, filtered
 * and paged in SQL. It briefly also had a no-query-string mode that returned
 * every show with every performance nested, kept alive only for the box office
 * navigator; that now uses `/api/performances?near=`, so the exception is gone
 * and the rule in server/utils/pagination.ts holds without one.
 *
 * ## Staying inside D1's 100 bound parameters
 *
 * Every *filter* is a correlated subquery or a scalar, never an id list — an
 * `IN` built from a result set is a latent hard failure as the archive grows,
 * and this endpoint sees the whole archive. The only list bound is the page's
 * own ≤50 show ids. Performance ids are never bound: 50 shows carry ~150
 * performances, which would blow the budget on its own, so the per-performance
 * lookups take a subquery instead. `countOccupiedSeats` documents that same
 * requirement at its own call site.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listShows)

  const { scope, status, from, to, view, sort, order, page, q, limit: rawLimit }
    = await getValidatedQuery(event, querySchema.parse)

  const maxLimit = view === 'options' ? MAX_OPTIONS_LIMIT : MAX_TREE_LIMIT
  const limit = Math.min(rawLimit ?? (view === 'options' ? MAX_OPTIONS_LIMIT : 25), maxLimit)
  const direction = order ?? (scope === 'archive' ? 'desc' : 'asc')

  // Correlated scalars over this show's performances. Raw SQL because Drizzle
  // has no expression for a correlated aggregate, and because written this way
  // they bind nothing at all — the run window costs zero parameters whether the
  // archive holds 500 shows or 50,000.
  const firstAt = sql<number | null>`(select min(${schema.performances.startsAt}) from ${schema.performances} where ${schema.performances.showId} = ${schema.shows.id})`
  const lastAt = sql<number | null>`(select max(${schema.performances.startsAt}) from ${schema.performances} where ${schema.performances.showId} = ${schema.shows.id})`

  // "Today" in Nottingham, not in the Worker's UTC — an hour's difference right
  // through British Summer Time, which is enough to file tonight's show under
  // the archive.
  const todayLondon = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const dayStart = unixSeconds(validityStart(todayLondon))
  const dayEnd = unixSeconds(validityEnd(todayLondon))

  const filters = []

  switch (scope) {
    case 'draft':
      filters.push(eq(schema.shows.status, 'DRAFT'))
      break
    case 'current':
      filters.push(eq(schema.shows.status, 'PUBLISHED'), lte(firstAt, dayEnd), gte(lastAt, dayStart))
      break
    case 'upcoming':
      filters.push(eq(schema.shows.status, 'PUBLISHED'), gt(firstAt, dayEnd))
      break
    case 'active':
      filters.push(eq(schema.shows.status, 'PUBLISHED'), gte(lastAt, dayStart))
      break
    case 'archive':
      // A published show with no performances yet belongs here rather than
      // nowhere: it is the only scope with an `IS NULL` arm, and without it the
      // four scopes would not add up to the whole.
      filters.push(eq(schema.shows.status, 'PUBLISHED'), or(lt(lastAt, dayStart), isNull(lastAt)))
      break
    case 'all':
      break
  }

  if (status) filters.push(eq(schema.shows.status, status))

  if (from || to) {
    const windowFilters = []
    if (from) windowFilters.push(gte(schema.performances.startsAt, validityStart(from)))
    if (to) windowFilters.push(lte(schema.performances.startsAt, validityEnd(to)))
    filters.push(inArray(
      schema.shows.id,
      db.select({ id: schema.performances.showId })
        .from(schema.performances)
        .where(and(...windowFilters)),
    ))
  }

  if (q) {
    // Venue is matched through a subquery for the same reason as everything else
    // here — and because "which shows were in the Djanogly" is a question the
    // archive gets asked, and the old client-side filter could not answer it.
    const atMatchingVenue = db
      .select({ id: schema.performances.showId })
      .from(schema.performances)
      .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
      .where(likeInsensitive(schema.venues.name, q))

    filters.push(or(
      likeInsensitive(schema.shows.title, q),
      likeInsensitive(schema.shows.subtitle, q),
      likeInsensitive(schema.shows.slug, q),
      inArray(schema.shows.id, atMatchingVenue),
    ))
  }

  const where = filters.length ? and(...filters) : undefined

  const [totalRow] = await db.select({ n: count() }).from(schema.shows).where(where)
  const total = totalRow?.n ?? 0
  if (total === 0) return paginated([], 0, { page, limit })

  const orderBy = sort === 'title'
    ? [direction === 'asc' ? asc(schema.shows.title) : desc(schema.shows.title)]
    : [direction === 'asc' ? asc(firstAt) : desc(firstAt), asc(schema.shows.title)]

  // Ids only. The correlated scalars above are used to *filter* and *order*
  // here, not to project: selecting them alongside `shows` columns returns null,
  // because the relational builder resolves the outer reference differently in a
  // projection than it does in a predicate. The run window is derived from the
  // performances that come back with each row instead, which costs nothing —
  // they are already loaded.
  const pageRows = await db
    .select({ id: schema.shows.id })
    .from(schema.shows)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offsetFor({ page, limit }))

  const pageIds = pageRows.map(r => r.id)
  if (pageIds.length === 0) return paginated([], total, { page, limit })

  if (view === 'options') {
    // No run window here on purpose: deriving one would mean binding up to 500
    // show ids, and a picker only needs to name the show. Filter by `scope`
    // instead if you want, say, only shows with a future performance.
    const options = await db
      .select({
        id: schema.shows.id,
        slug: schema.shows.slug,
        title: schema.shows.title,
        status: schema.shows.status,
      })
      .from(schema.shows)
      .where(inArray(schema.shows.id, pageIds))

    const byId = new Map(options.map(o => [o.id, o]))
    return paginated(
      pageIds.map(id => byId.get(id)).filter(row => row !== undefined),
      total,
      { page, limit },
    )
  }

  const rows = await db.query.shows.findMany({
    where: (shows, { inArray: within }) => within(shows.id, pageIds),
    // Only what the admin table renders. `longDescription` alone is a paragraph
    // per show; the detail page fetches the full record when it needs it.
    columns: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      posterUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    with: {
      performances: {
        orderBy: [asc(schema.performances.startsAt)],
        with: {
          venue: { columns: { id: true, name: true, capacity: true } },
        },
      },
    },
  })

  // Every per-performance lookup scopes through this rather than binding
  // performance ids: ~150 of them for a 50-show page, which alone exceeds D1's
  // budget. Only the ≤50 show ids are bound.
  const pagePerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(inArray(schema.performances.showId, pageIds))

  const [showOverrideCounts, perfOverrideCounts, ticketCountMap] = await Promise.all([
    db.select({ showId: schema.showTicketTypeOverrides.showId, c: count() })
      .from(schema.showTicketTypeOverrides)
      .where(inArray(schema.showTicketTypeOverrides.showId, pageIds))
      .groupBy(schema.showTicketTypeOverrides.showId),
    db.select({ performanceId: schema.performanceTicketTypeOverrides.performanceId, c: count() })
      .from(schema.performanceTicketTypeOverrides)
      .where(inArray(schema.performanceTicketTypeOverrides.performanceId, pagePerformances))
      .groupBy(schema.performanceTicketTypeOverrides.performanceId),
    // Seats occupied per performance, by the shared rule so this listing agrees
    // with what the booking path will actually allow. Scoped to the page, which
    // is also why this no longer joins every ticket ever issued.
    countOccupiedSeats(inArray(schema.tickets.performanceId, pagePerformances)),
  ])

  const showOverrideMap = new Map(showOverrideCounts.map(r => [r.showId, r.c]))
  const perfOverrideMap = new Map(perfOverrideCounts.map(r => [r.performanceId, r.c]))
  const rowById = new Map(rows.map(row => [row.id, row]))

  // Re-ordered to the page query's ordering: `findMany` with an `IN` gives no
  // ordering guarantee, and the sort is the whole point of `?sort=run`.
  const ordered = pageIds.map(id => rowById.get(id)).filter(row => row !== undefined)

  return paginated(
    ordered.map((show) => {
      // Performances arrive sorted by `startsAt`, so the ends of the array are
      // the ends of the run.
      const performances = show.performances
      return {
        ...show,
        ticketTypeOverrideCount: showOverrideMap.get(show.id) ?? 0,
        performanceCount: performances.length,
        firstPerformanceAt: performances.at(0)?.startsAt ?? null,
        lastPerformanceAt: performances.at(-1)?.startsAt ?? null,
        performances: performances.map(perf => ({
          ...perf,
          ticketTypeOverrideCount: perfOverrideMap.get(perf.id) ?? 0,
          ticketsSold: ticketCountMap.get(perf.id) ?? 0,
        })),
      }
    }),
    total,
    { page, limit },
  )
})
