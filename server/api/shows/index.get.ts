import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { listShows } from '~~/shared/utils/abilities'

/**
 * The four disjoint slices the admin UI navigates by; they partition every
 * show exactly once. Definitions: docs/03-domain-model.md
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
 * A `tree` page is capped well below D1's limit: the page's own show ids are
 * the one thing bound as a list (ADR-0006).
 */
const MAX_TREE_LIMIT = 50
const MAX_OPTIONS_LIMIT = 500

/** `performances.startsAt` is `mode: 'timestamp'` — unix **seconds**, not ms. */
function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

/**
 * GET /api/shows — list shows.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listShows)

  const { scope, status, from, to, view, sort, order, page, q, limit: rawLimit }
    = await getValidatedQuery(event, querySchema.parse)

  const maxLimit = view === 'options' ? MAX_OPTIONS_LIMIT : MAX_TREE_LIMIT
  const limit = Math.min(rawLimit ?? (view === 'options' ? MAX_OPTIONS_LIMIT : 25), maxLimit)
  const direction = order ?? (scope === 'archive' ? 'desc' : 'asc')

  // Correlated scalars over this show's performances. Raw SQL, because written
  // this way they bind nothing at all.
  const firstAt = sql<number | null>`(select min(${schema.performances.startsAt}) from ${schema.performances} where ${schema.performances.showId} = ${schema.shows.id})`
  const lastAt = sql<number | null>`(select max(${schema.performances.startsAt}) from ${schema.performances} where ${schema.performances.showId} = ${schema.shows.id})`

  // "Today" in Nottingham, not the Worker's UTC — an hour's difference through
  // BST is enough to file tonight's show under the archive.
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
      // The only scope with an `IS NULL` arm: without it a published show with no
      // performances would belong to none of the four.
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
    // Venue matched through a subquery for the same reason as everything else
    // here (ADR-0006).
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

  // Ids only. The correlated scalars filter and order but cannot be projected —
  // the outer reference resolves differently in a projection.
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
    // No run window here: deriving one would mean binding up to 500 show ids, and
    // a picker only needs the show's name.
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

  // Every per-performance lookup scopes through this rather than binding ids —
  // ~150 for a 50-show page would exceed D1's budget (ADR-0006).
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
    // Seats occupied by the shared rule, so the listing agrees with what the
    // booking path allows (ADR-0007).
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
