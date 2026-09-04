import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { AdminPerformance, AdminShow, ShowStatus } from '#shared/utils/programme'
import type { SQL } from 'drizzle-orm'

// Reading and counting the programme for its administration (D-121, D-112). "Has sold tickets" is
// a question about rows in other tables, never a flag on a show or a performance.

// Every table that points at `performances`, each declared as holding a sold seat or not. A new
// referencing table joins this list or `tests/integration/programme-admin.test.ts` fails (D-121).
export interface PerformanceReference {
  table: string
  column: string
  // True when a row here means somebody holds a seat, so the performance may be cancelled but
  // never deleted, and cancelling it owes that person a refund and a message.
  sold: boolean
  // How to count this table's held rows, where a bare row count would be wrong. `tickets` needs
  // one: an expired hold is a row and is not a seat (D-105).
  heldBy?: (performanceId: SQL) => SQL
  why: string
}

export const PERFORMANCE_REFERENCES: PerformanceReference[] = [
  {
    table: 'performance_ticket_overrides',
    column: 'performance_id',
    sold: false,
    why: 'a price this performance would charge: configuration, and nobody has bought anything',
  },
  {
    table: 'shifts',
    column: 'performance_id',
    sold: false,
    why: 'a slot on the rota: who is working, and nobody has bought a seat (E-102)',
  },
]

export function soldReferences(references = PERFORMANCE_REFERENCES): PerformanceReference[] {
  return references.filter(reference => reference.sold)
}

// How one reference counts the seats a performance holds. A table saying so itself wins, because
// a bare row count over `tickets` would call an expired hold a sold seat (D-105).
function heldTerm(reference: PerformanceReference, performanceId: SQL): SQL {
  if (reference.heldBy) return reference.heldBy(performanceId)
  return sql`(SELECT count(*) FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${performanceId})`
}

// A correlated count per sold table, binding nothing: the parameter count is fixed however many
// performances or tickets exist (0003, 0006).
export function performanceSoldColumn(alias: string, references = soldReferences()): SQL {
  if (references.length === 0) return sql`0`
  return sql.join(references.map(reference => heldTerm(reference, sql`${sql.raw(alias)}.id`)), sql` + `)
}

// The same count for a whole show, scoped through its performances by subquery rather than by an
// id list read back from a result set (0006).
export function showSoldColumn(alias: string, references = soldReferences()): SQL {
  if (references.length === 0) return sql`0`
  // Its own alias, never the caller's: a caller passing `sp` for the show would otherwise
  // collide with this subquery's own performances row.
  const terms = references.map(reference => sql`(
    SELECT coalesce(sum(${heldTerm(reference, sql`sp.id`)}), 0)
    FROM performances sp WHERE sp.show_id = ${sql.raw(alias)}.id
  )`)
  return sql.join(terms, sql` + `)
}

// One parameter per sold table, whatever the registry holds, so a caller can ask about a single
// performance without an id list.
export function performanceSoldQuery(performanceId: string, references = soldReferences()): SQL {
  if (references.length === 0) return sql`SELECT 0 AS sold`
  return sql`SELECT ${sql.join(references.map(reference => heldTerm(reference, sql`${performanceId}`)), sql` + `)} AS sold`
}

export interface ShowFilters {
  status?: ShowStatus
  search?: string
  // Published, warned about nothing and never confirmed clear: what D-102 criterion 2 flags.
  unassessed?: boolean
}

interface ShowRow extends Omit<AdminShow, 'warningsConfirmedNone'> {
  warningsConfirmedNone: number
}

const readShow = (row: ShowRow): AdminShow => ({ ...row, warningsConfirmedNone: row.warningsConfirmedNone === 1 })

// A typed percent sign is a character somebody is looking for, not a wildcard.
const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// Two bound parameters at most, whatever the filters and however many shows there are (0003).
function predicate(filters: ShowFilters): SQL {
  const terms: SQL[] = []
  if (filters.status) terms.push(sql`s.status = ${filters.status}`)
  if (filters.search) terms.push(sql`(s.title LIKE ${contains(filters.search)} ESCAPE '\\' OR s.slug LIKE ${contains(filters.search)} ESCAPE '\\')`)
  if (filters.unassessed) terms.push(sql`(${UNASSESSED})`)
  return terms.length ? sql` WHERE ${sql.join(terms, sql` AND `)}` : sql``
}

const SHOW_COLUMNS = sql`
  s.id AS id,
  s.slug AS slug,
  s.title AS title,
  s.subtitle AS subtitle,
  s.description AS description,
  s.long_description AS longDescription,
  s.age_guidance AS ageGuidance,
  s.latecomer_policy AS latecomerPolicy,
  s.category_id AS categoryId,
  s.season_id AS seasonId,
  s.booking_closes_hours_before AS bookingClosesHoursBefore,
  s.warnings_confirmed_none AS warningsConfirmedNone,
  s.status AS status
`

// Counted rather than stored, so the console cannot show a figure the rows disagree with.
const SHOW_COUNTS = sql`
  (SELECT count(*) FROM performances p WHERE p.show_id = s.id) AS performanceCount,
  (SELECT count(*) FROM performances p WHERE p.show_id = s.id AND p.status = 'ON_SALE') AS onSaleCount,
  (SELECT count(*) FROM show_content_warnings w WHERE w.show_id = s.id) AS warningCount
`

// A published show nobody has assessed is what the overview flags, so the predicate is one
// expression both the filter and that card read (D-102 criterion 2).
const UNASSESSED = sql`
  s.status = 'PUBLISHED'
  AND s.warnings_confirmed_none = 0
  AND NOT EXISTS (SELECT 1 FROM show_content_warnings w WHERE w.show_id = s.id)
`

export function showsQuery(filters: ShowFilters, limit: number, offset: number, references = soldReferences()): SQL {
  return sql`
    SELECT ${SHOW_COLUMNS}, ${SHOW_COUNTS}, ${showSoldColumn('s', references)} AS soldTickets
    FROM shows s${predicate(filters)}
    ORDER BY s.status, s.title COLLATE NOCASE
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listShows(filters: ShowFilters, limit: number, offset: number): Promise<AdminShow[]> {
  return (await db.all<ShowRow>(showsQuery(filters, limit, offset))).map(readShow)
}

export async function countShows(filters: ShowFilters): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM shows s${predicate(filters)}`)
  return Number(row?.total ?? 0)
}

export async function showById(id: string): Promise<AdminShow | undefined> {
  const [row] = await db.all<ShowRow>(sql`
    SELECT ${SHOW_COLUMNS}, ${SHOW_COUNTS}, ${showSoldColumn('s')} AS soldTickets
    FROM shows s WHERE s.id = ${id}
  `)
  return row ? readShow(row) : undefined
}

// The slug is the public URL, so it is held once across draft and published shows alike.
export async function showBySlug(slug: string, exceptId?: string): Promise<AdminShow | undefined> {
  const except = exceptId ? sql` AND s.id <> ${exceptId}` : sql``
  const [row] = await db.all<ShowRow>(sql`
    SELECT ${SHOW_COLUMNS}, ${SHOW_COUNTS}, ${showSoldColumn('s')} AS soldTickets
    FROM shows s WHERE s.slug = ${slug}${except} LIMIT 1
  `)
  return row ? readShow(row) : undefined
}

const PERFORMANCE_COLUMNS = sql`
  p.id AS id,
  p.show_id AS showId,
  p.venue_id AS venueId,
  v.name AS venueName,
  p.starts_at AS startsAt,
  p.doors_at AS doorsAt,
  p.duration_minutes AS durationMinutes,
  p.interval_count AS intervalCount,
  p.interval_minutes AS intervalMinutes,
  p.capacity_override AS capacityOverride,
  v.capacity AS venueCapacity,
  p.booking_closes_hours_before AS bookingClosesHoursBefore,
  p.external_booking_url AS externalBookingUrl,
  p.status AS status,
  p.notes AS notes
`

// Every performance of one show, bound by the show id alone: two venues may run at once and one
// venue may run a matinee and an evening, so nothing here groups by day or venue (E-127).
export function showPerformancesQuery(showId: string, references = soldReferences()): SQL {
  return sql`
    SELECT ${PERFORMANCE_COLUMNS}, ${performanceSoldColumn('p', references)} AS soldTickets
    FROM performances p
    JOIN venues v ON v.id = p.venue_id
    WHERE p.show_id = ${showId}
    ORDER BY p.starts_at, v.name, p.id
  `
}

export async function showPerformances(showId: string): Promise<AdminPerformance[]> {
  return db.all<AdminPerformance>(showPerformancesQuery(showId))
}

export interface PerformanceWithShow extends AdminPerformance {
  showStatus: ShowStatus
  showTitle: string
  showBookingClosesHoursBefore: number | null
}

export async function performanceById(id: string): Promise<PerformanceWithShow | undefined> {
  const [row] = await db.all<PerformanceWithShow>(sql`
    SELECT ${PERFORMANCE_COLUMNS},
           ${performanceSoldColumn('p')} AS soldTickets,
           s.status AS showStatus,
           s.title AS showTitle,
           s.booking_closes_hours_before AS showBookingClosesHoursBefore
    FROM performances p
    JOIN shows s ON s.id = p.show_id
    JOIN venues v ON v.id = p.venue_id
    WHERE p.id = ${id}
  `)
  return row
}

// The cascade D-121 criterion 2 asks for: one statement over the show's performances, binding the
// show id alone however many there are, and skipping cancelled ones by predicate (0006).
export function cascadeOnSaleQuery(showId: string): SQL {
  return sql`
    UPDATE performances SET status = 'ON_SALE', updated_at = unixepoch()
    WHERE show_id = ${showId} AND status = 'DRAFT'
  `
}

export interface ProgrammeVenue {
  id: string
  name: string
  capacity: number | null
}

export async function listVenues(): Promise<ProgrammeVenue[]> {
  return db.all<ProgrammeVenue>(sql`SELECT id, name, capacity FROM venues ORDER BY name COLLATE NOCASE`)
}
