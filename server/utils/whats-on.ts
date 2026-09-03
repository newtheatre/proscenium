import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { warningsForListedShowsQuery } from './content-warnings'
import { performanceSoldColumn } from './programme'
import { publicContentWarnings, warningAssessment } from '#shared/utils/content-warnings'
import { offsetFor } from '#shared/utils/pagination'
import {
  listingCacheSeconds,
  performanceAvailability,
  publicPerformance,
  publicShow,
  remainingSeats,
  saysAvailability,
} from '#shared/utils/programme'
import { resolvePrice } from '#shared/utils/ticket-types'
import type { PublicContentWarning, ShowContentWarning, WarningAssessment } from '#shared/utils/content-warnings'
import type { Availability, PublicPerformance, PublicShow } from '#shared/utils/programme'
import type { SQL } from 'drizzle-orm'

// The public programme (D-101, D-102). Every payload here goes through the allow-listed
// projections in `shared/utils/programme.ts`; no column reaches a visitor without being named.

// A performance a visitor may be shown: on the site, and not already begun. A show still running
// is not on offer, and the door is the answer for it (D-101 criterion 1).
const listable = (at: number): SQL =>
  sql`p.status <> 'DRAFT' AND p.starts_at >= ${at}`

// Published, and with something still to sell. A show whose last performance has passed drops off
// the listing on its own, with nothing to sweep.
export function listedShowsQuery(at: number, limit: number, offset: number): SQL {
  return sql`
    SELECT s.id AS id, s.slug AS slug, s.title AS title, s.subtitle AS subtitle,
           s.description AS description, s.long_description AS longDescription,
           s.age_guidance AS ageGuidance, s.latecomer_policy AS latecomerPolicy,
           s.status AS status, s.warnings_confirmed_none AS warningsConfirmedNone,
           c.name AS categoryName,
           (SELECT min(p.starts_at) FROM performances p
             WHERE p.show_id = s.id AND p.status = 'ON_SALE' AND p.starts_at >= ${at}) AS opensAt
    FROM shows s
    LEFT JOIN show_categories c ON c.id = s.category_id
    WHERE s.status = 'PUBLISHED'
      AND EXISTS (SELECT 1 FROM performances p
                   WHERE p.show_id = s.id AND p.status = 'ON_SALE' AND p.starts_at >= ${at})
    ORDER BY opensAt, s.title COLLATE NOCASE
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countListedShowsQuery(at: number): SQL {
  return sql`
    SELECT count(*) AS total FROM shows s
    WHERE s.status = 'PUBLISHED'
      AND EXISTS (SELECT 1 FROM performances p
                   WHERE p.show_id = s.id AND p.status = 'ON_SALE' AND p.starts_at >= ${at})
  `
}

// The page's shows again as a subquery rather than an id list read back from the first result
// set: the parameter count is the same whether the page holds one show or a hundred (0003, 0006).
export const listedShowScope = (at: number, limit: number, offset: number): SQL =>
  sql`SELECT id FROM (${listedShowsQuery(at, limit, offset)})`

// One published show by its address, which is the same scope narrowed to one row.
export const oneShowScope = (slug: string): SQL =>
  sql`SELECT id FROM shows WHERE slug = ${slug} AND status = 'PUBLISHED'`

interface PerformanceRow {
  id: string
  showId: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  venueName: string
  externalBookingUrl: string | null
  status: 'DRAFT' | 'ON_SALE' | 'CANCELLED'
  showStatus: 'DRAFT' | 'PUBLISHED'
  bookingClosesHoursBefore: number | null
  showBookingClosesHoursBefore: number | null
  capacity: number | null
  sold: number
}

// The sold count is `PERFORMANCE_REFERENCES`, so it starts at nought and begins counting the day
// D-104 classifies `tickets`. Nothing here holds a second answer to how full a house is.
export function listedPerformancesQuery(scope: SQL, at: number): SQL {
  return sql`
    SELECT p.id AS id,
           p.show_id AS showId,
           p.starts_at AS startsAt,
           p.doors_at AS doorsAt,
           p.duration_minutes AS durationMinutes,
           p.interval_count AS intervalCount,
           p.interval_minutes AS intervalMinutes,
           v.name AS venueName,
           p.external_booking_url AS externalBookingUrl,
           p.status AS status,
           s.status AS showStatus,
           p.booking_closes_hours_before AS bookingClosesHoursBefore,
           s.booking_closes_hours_before AS showBookingClosesHoursBefore,
           coalesce(p.capacity_override, v.capacity) AS capacity,
           ${performanceSoldColumn('p')} AS sold
    FROM performances p
    JOIN shows s ON s.id = p.show_id
    JOIN venues v ON v.id = p.venue_id
    WHERE p.show_id IN (${scope}) AND ${listable(at)}
    ORDER BY p.starts_at, v.name, p.id
  `
}

interface PriceRow {
  performanceId: string
  name: string
  description: string | null
  basePrice: number
  activeByDefault: number
  showPrice: number | null
  showActive: number | null
  performancePrice: number | null
  performanceActive: number | null
}

// Archived types and every flagged one are excluded in SQL as well as in the projection, so an
// access ticket cannot reach a public payload even if a caller forgets the filter (D-119).
export function listedPricesQuery(scope: SQL, at: number): SQL {
  return sql`
    SELECT p.id AS performanceId,
           t.name AS name,
           t.description AS description,
           t.price AS basePrice,
           t.active_by_default AS activeByDefault,
           so.price AS showPrice,
           so.active AS showActive,
           po.price AS performancePrice,
           po.active AS performanceActive
    FROM performances p
    JOIN shows s ON s.id = p.show_id
    JOIN ticket_types t ON t.archived = 0 AND t.access_kind IS NULL AND t.kind = 'SINGLE'
    LEFT JOIN show_ticket_overrides so ON so.show_id = p.show_id AND so.ticket_type_id = t.id
    LEFT JOIN performance_ticket_overrides po ON po.performance_id = p.id AND po.ticket_type_id = t.id
    WHERE p.show_id IN (${scope}) AND ${listable(at)}
    ORDER BY p.id, t.price, t.name COLLATE NOCASE
  `
}

export interface PublicPrice {
  name: string
  description: string | null
  price: number
}

export interface ListedPerformance extends PublicPerformance {
  availability: Availability
  // Null is an uncapped venue, so a number here is a fact and its absence is not a nought.
  remaining: number | null
  says: string
  prices: PublicPrice[]
}

export interface ListedShow {
  show: PublicShow
  categoryName: string | null
  assessment: WarningAssessment
  warnings: PublicContentWarning[]
  performances: ListedPerformance[]
}

export interface PublicListing {
  items: ListedShow[]
  total: number
  // The seconds this response may be held anywhere, ending at the first window it describes
  // closing (D-112 criterion 4).
  cacheSeconds: number
}

interface ShowRow extends PublicShow {
  id: string
  status: 'DRAFT' | 'PUBLISHED'
  warningsConfirmedNone: number
  categoryName: string | null
}

interface ShowWarningRow extends Omit<ShowContentWarning, 'archived'> {
  showId: string
  archived: number
}

// SQLite answers a nullable boolean as 0, 1 or null, and null means inherit here rather than off.
const readFlag = (value: number | null): boolean | null => (value === null ? null : value === 1)

// One assembly for the listing and for a single show, so the two cannot answer differently about
// the same performance (D-101 criterion 2).
function assemble(
  shows: ShowRow[],
  performances: PerformanceRow[],
  prices: PriceRow[],
  warnings: ShowWarningRow[],
  limited: number,
  at: Date,
): ListedShow[] {
  const pricesFor = new Map<string, PublicPrice[]>()
  for (const row of prices) {
    const resolved = resolvePrice(
      { price: row.basePrice, activeByDefault: row.activeByDefault === 1 },
      row.showPrice === null && row.showActive === null ? null : { price: row.showPrice, active: readFlag(row.showActive) },
      row.performancePrice === null && row.performanceActive === null
        ? null
        : { price: row.performancePrice, active: readFlag(row.performanceActive) },
    )
    if (!resolved.active) continue
    const held = pricesFor.get(row.performanceId) ?? []
    held.push({ name: row.name, description: row.description, price: resolved.price })
    pricesFor.set(row.performanceId, held)
  }

  const listed = new Map<string, ListedPerformance[]>()
  for (const row of performances) {
    const projected = publicPerformance(row)
    if (!projected) continue
    const house = { capacity: row.capacity, sold: Number(row.sold) }
    const availability = performanceAvailability(row, house, limited, at)
    const remaining = remainingSeats(house)
    const held = listed.get(row.showId) ?? []
    held.push({
      ...projected,
      availability,
      remaining,
      says: saysAvailability(availability, remaining),
      prices: (pricesFor.get(row.id) ?? []).sort((a, b) => a.price - b.price),
    })
    listed.set(row.showId, held)
  }

  const warningsFor = new Map<string, ShowContentWarning[]>()
  for (const row of warnings) {
    const held = warningsFor.get(row.showId) ?? []
    held.push({ ...row, archived: row.archived === 1 })
    warningsFor.set(row.showId, held)
  }

  return shows.flatMap((row) => {
    const projected = publicShow(row)
    if (!projected) return []
    const carried = warningsFor.get(row.id) ?? []
    return [{
      show: projected,
      categoryName: row.categoryName,
      assessment: warningAssessment({
        warningsConfirmedNone: row.warningsConfirmedNone === 1,
        warningCount: carried.length,
      }),
      warnings: publicContentWarnings(carried),
      performances: listed.get(row.id) ?? [],
    }]
  })
}

// The limited threshold is passed in rather than read here: this file is imported by the test
// projects, which resolve no Nuxt auto-import, and the routes are where configuration is read.
export async function publicListing(
  limitedPercent: number,
  page: number,
  pageSize: number,
  now: Date = new Date(),
): Promise<PublicListing> {
  const at = Math.floor(now.getTime() / 1000)
  const scope = listedShowScope(at, pageSize, offsetFor(page, pageSize))

  const [shows, performances, prices, warnings, counted] = await Promise.all([
    db.all<ShowRow>(listedShowsQuery(at, pageSize, offsetFor(page, pageSize))),
    db.all<PerformanceRow>(listedPerformancesQuery(scope, at)),
    db.all<PriceRow>(listedPricesQuery(scope, at)),
    db.all<ShowWarningRow>(warningsForListedShowsQuery(scope)),
    db.all<{ total: number }>(countListedShowsQuery(at)),
  ])

  const items = assemble(shows, performances, prices, warnings, limitedPercent, now)
  return {
    items,
    total: Number(counted[0]?.total ?? 0),
    cacheSeconds: listingCacheSeconds(items.flatMap(item => item.performances.map(one => one.bookingClosesAt)), now),
  }
}

// One published show by its public address. A draft show has no public page at all, which is what
// `publicShow()` answering with nothing means (D-101 criterion 1).
export async function publicShowBySlug(
  limitedPercent: number,
  slug: string,
  now: Date = new Date(),
): Promise<ListedShow | null> {
  const at = Math.floor(now.getTime() / 1000)
  const scope = oneShowScope(slug)

  const [shows, performances, prices, warnings] = await Promise.all([
    db.all<ShowRow>(sql`
      SELECT s.id AS id, s.slug AS slug, s.title AS title, s.subtitle AS subtitle,
             s.description AS description, s.long_description AS longDescription,
             s.age_guidance AS ageGuidance, s.latecomer_policy AS latecomerPolicy,
             s.status AS status, s.warnings_confirmed_none AS warningsConfirmedNone,
             c.name AS categoryName
      FROM shows s
      LEFT JOIN show_categories c ON c.id = s.category_id
      WHERE s.slug = ${slug} AND s.status = 'PUBLISHED'
    `),
    db.all<PerformanceRow>(listedPerformancesQuery(scope, at)),
    db.all<PriceRow>(listedPricesQuery(scope, at)),
    db.all<ShowWarningRow>(warningsForListedShowsQuery(scope)),
  ])

  return assemble(shows, performances, prices, warnings, limitedPercent, now)[0] ?? null
}
