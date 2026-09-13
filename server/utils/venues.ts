import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { aliasColumns, whereFrom } from './list-filters'
import { venuesList } from '#shared/utils/venues-list'
import type { SQL } from 'drizzle-orm'
import type { ListClause } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type { AdminVenue } from '#shared/utils/venues'

// Reading venues, and the one predicate D-131 criterion 4 turns on. "In use" is a question about
// rows in other tables, never a flag on this one, the same discipline D-119 set for ticket types.

// Every table that points at `venues`, each named so the refusal can say what is holding it open.
// A new referencing table joins this list or `tests/integration/venues.test.ts` fails.
export interface VenueReference {
  table: string
  column: string
  why: string
}

export const VENUE_REFERENCES: VenueReference[] = [
  { table: 'performances', column: 'venue_id', why: 'a performance is scheduled here' },
  { table: 'venue_emergency_info', column: 'venue_id', why: 'it carries an emergency card' },
  { table: 'shift_templates', column: 'venue_id', why: 'a shift template is planned against it' },
  { table: 'checklist_items', column: 'venue_id', why: 'its pre or post-show checklist is configured' },
  { table: 'night_reports', column: 'venue_id', why: 'a night has been closed here' },
  { table: 'backstage_nights', column: 'venue_id', why: 'the backstage board has run here' },
  { table: 'comp_requests', column: 'venue_id', why: 'a comp has been requested against it' },
  { table: 'till_sessions', column: 'venue_id', why: 'a bar till has traded here' },
]

// A correlated EXISTS per referencing table, binding nothing: the parameter count is fixed
// however many venues or referencing rows exist (0003, 0006).
export function venueInUseColumn(alias: string, references = VENUE_REFERENCES): SQL {
  if (references.length === 0) return sql`0`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${sql.raw(alias)}.id)`)
  return sql`CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END`
}

// The same question about one venue, bound by its id. One parameter per referencing table.
export function venueInUseQuery(venueId: string, references = VENUE_REFERENCES): SQL {
  if (references.length === 0) return sql`SELECT 0 AS inUse`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${venueId})`)
  return sql`SELECT CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END AS inUse`
}

// Which of the referencing tables hold a row for this venue, for a refusal that names what is
// holding it open rather than saying "in use" and leaving the reader to guess.
export async function venueInUseBy(venueId: string, references = VENUE_REFERENCES): Promise<VenueReference[]> {
  const holding: VenueReference[] = []
  for (const reference of references) {
    const [row] = await db.all<{ present: number }>(sql`
      SELECT EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${venueId}) AS present
    `)
    if (row?.present === 1) holding.push(reference)
  }
  return holding
}

const COLUMNS = sql`
  v.id AS id,
  v.name AS name,
  v.address AS address,
  v.capacity AS capacity,
  v.is_external AS isExternal,
  v.image_key AS imageKey,
  v.description AS description,
  v.room_id AS roomId,
  v.archived AS archived
`

interface VenueRow extends Omit<AdminVenue, 'isExternal' | 'archived' | 'inUse'> {
  isExternal: number
  archived: number
  inUse: number
}

const read = (row: VenueRow): AdminVenue => ({
  ...row,
  isExternal: row.isExternal === 1,
  archived: row.archived === 1,
  inUse: row.inUse === 1,
})

export function venuesClause(query: ListQuery): ListClause {
  return whereFrom(venuesList, query, {
    column: aliasColumns('v'),
    search: [sql`v.name`],
  })
}

const predicate = (clause: ListClause): SQL => (clause.where ? sql` WHERE ${clause.where}` : sql``)

export function venuesQuery(clause: ListClause, limit: number, offset: number): SQL {
  return sql`
    SELECT ${COLUMNS}, ${venueInUseColumn('v')} AS inUse
    FROM venues v${predicate(clause)}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listVenuesAdmin(clause: ListClause, limit: number, offset: number): Promise<AdminVenue[]> {
  return (await db.all<VenueRow>(venuesQuery(clause, limit, offset))).map(read)
}

export async function countVenuesAdmin(clause: ListClause): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM venues v${predicate(clause)}`)
  return Number(row?.total ?? 0)
}

export async function venueById(id: string): Promise<AdminVenue | undefined> {
  const [row] = await db.all<VenueRow>(sql`
    SELECT ${COLUMNS}, ${venueInUseColumn('v')} AS inUse FROM venues v WHERE v.id = ${id}
  `)
  return row ? read(row) : undefined
}

// Held once whatever the capitals: two venues called The Studio and the studio are one venue to
// everybody who reads a report (D-131, echoing D-119 criterion 1).
export async function venueNamed(name: string, exceptId?: string): Promise<AdminVenue | undefined> {
  const except = exceptId ? sql` AND v.id <> ${exceptId}` : sql``
  const [row] = await db.all<VenueRow>(sql`
    SELECT ${COLUMNS}, ${venueInUseColumn('v')} AS inUse
    FROM venues v WHERE v.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row ? read(row) : undefined
}
