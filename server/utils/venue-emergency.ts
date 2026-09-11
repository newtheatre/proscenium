import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { aliasColumns, whereFrom, yesNo } from './list-filters'
import { emergencyCardsList } from '#shared/utils/emergency-cards-list'
import type { ListClause } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type { EmergencyCardInput } from '#shared/utils/venue-emergency'
import type { SQL } from 'drizzle-orm'

// The venue emergency card (E-113), append-only like `incidents`: an edit is a new row, and the
// latest one per venue is the current card.

const predicateOf = (clause: ListClause): SQL => (clause.where ? sql` WHERE ${clause.where}` : sql``)

export interface RecordedCard { id: string, statement: SQL }

// No predicate: a fresh version never contends, since nothing else can have created it.
export function recordCardStatement(venueId: string, input: EmergencyCardInput, updatedBy: string, id: string): RecordedCard {
  const statement = sql`
    INSERT INTO venue_emergency_info (id, venue_id, assembly_point, exits, isolation_points, what3words, notes, updated_by)
    VALUES (${id}, ${venueId}, ${input.assemblyPoint}, ${input.exits}, ${input.isolationPoints}, ${input.what3words}, ${input.notes}, ${updatedBy})
    RETURNING id
  `
  return { id, statement }
}

export interface EmergencyCard {
  id: string
  venueId: string
  venueName: string
  assemblyPoint: string | null
  exits: string | null
  isolationPoints: string | null
  what3words: string | null
  notes: string | null
  updatedByName: string
  updatedAt: number
}

// `v.id`, never `e.venue_id`: a venue with no card yet still names itself correctly in
// `currentCardsQuery()`'s outer join, where `e` and its columns are all null.
const CARD_COLUMNS = sql`
  e.id AS id, v.id AS venueId, v.name AS venueName,
  e.assembly_point AS assemblyPoint, e.exits AS exits, e.isolation_points AS isolationPoints,
  e.what3words AS what3words, e.notes AS notes, u.name AS updatedByName, e.updated_at AS updatedAt
`

// The latest row per venue is the current card: no supersede reference to chase, since nothing
// else can be more recent than the highest `updated_at` (E-113 criterion 1).
export function currentCardQuery(venueId: string): SQL {
  return sql`
    SELECT ${CARD_COLUMNS}
    FROM venue_emergency_info e
    JOIN venues v ON v.id = e.venue_id
    JOIN users u ON u.id = e.updated_by
    WHERE e.venue_id = ${venueId}
    ORDER BY e.updated_at DESC
    LIMIT 1
  `
}

export async function currentCard(venueId: string): Promise<EmergencyCard | undefined> {
  const [row] = await db.all<EmergencyCard>(currentCardQuery(venueId))
  return row
}

// A venue with no card at all yet: every column the outer join could not fill.
export type VenueCardRow = Omit<EmergencyCard, 'id' | 'updatedByName' | 'updatedAt'> & {
  id: string | null
  updatedByName: string | null
  updatedAt: number | null
}

// Search and "filed" through the declaration (K-129); paging scopes the outer join by a
// subquery over the venues it covers, never by an id list read back from a result set (0006).
export function emergencyCardsClause(query: ListQuery): ListClause {
  return whereFrom(emergencyCardsList, query, {
    column: aliasColumns('vp'),
    search: [sql`vp.name`],
    fields: {
      filed: yesNo(sql`exists (select 1 from venue_emergency_info ei where ei.venue_id = vp.id)`),
    },
  })
}

// Every matching venue's current card in one query, for the committee's own overview screen,
// the same join-and-pick-latest shape `listVenueChecklists()` uses for its own per-venue rows.
export function currentCardsQuery(clause: ListClause, limit: number, offset: number): SQL {
  return sql`
    SELECT ${CARD_COLUMNS}
    FROM venues v
    LEFT JOIN venue_emergency_info e ON e.id = (
      SELECT id FROM venue_emergency_info WHERE venue_id = v.id ORDER BY updated_at DESC LIMIT 1
    )
    LEFT JOIN users u ON u.id = e.updated_by
    WHERE v.id IN (
      SELECT vp.id FROM venues vp${predicateOf(clause)}
      ORDER BY ${sql.join(clause.orderBy, sql`, `)}
      LIMIT ${limit} OFFSET ${offset}
    )
    ORDER BY v.name COLLATE NOCASE
  `
}

export async function currentCards(clause: ListClause, limit: number, offset: number): Promise<VenueCardRow[]> {
  return db.all<VenueCardRow>(currentCardsQuery(clause, limit, offset))
}

export async function countVenuesForCards(clause: ListClause): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM venues vp${predicateOf(clause)}`)
  return row?.total ?? 0
}
