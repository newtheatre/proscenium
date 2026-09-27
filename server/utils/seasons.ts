import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { aliasColumns, whereFrom } from './list-filters'
import { performanceNight } from './performances'
import { seasonsList } from '#shared/utils/seasons-list'
import type { SQL } from 'drizzle-orm'
import type { ListClause } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type { AdminSeason } from '#shared/utils/seasons'

// Reading seasons. "In use" is a show naming this season, never a flag on the row (D-131
// criterion 4, echoing D-119's own ticket type predicate).

export const SEASON_REFERENCES = [
  { table: 'shows', column: 'season_id', why: 'a show belongs to it' },
] as const

function inUseColumn(alias: string): SQL {
  return sql`CASE WHEN EXISTS (SELECT 1 FROM shows WHERE season_id = ${sql.raw(alias)}.id) THEN 1 ELSE 0 END`
}

export function seasonInUseQuery(seasonId: string): SQL {
  return sql`SELECT EXISTS (SELECT 1 FROM shows WHERE season_id = ${seasonId}) AS inUse`
}

const COLUMNS = sql`
  s.id AS id,
  s.name AS name,
  s.starts_on AS startsOn,
  s.ends_on AS endsOn,
  s.archived AS archived
`

interface SeasonRow extends Omit<AdminSeason, 'archived' | 'inUse'> {
  archived: number
  inUse: number
}

const read = (row: SeasonRow): AdminSeason => ({ ...row, archived: row.archived === 1, inUse: row.inUse === 1 })

export function seasonsClause(query: ListQuery): ListClause {
  return whereFrom(seasonsList, query, {
    column: aliasColumns('s'),
    search: [sql`s.name`],
  })
}

const predicate = (clause: ListClause): SQL => (clause.where ? sql` WHERE ${clause.where}` : sql``)

export function seasonsQuery(clause: ListClause, limit: number, offset: number): SQL {
  return sql`
    SELECT ${COLUMNS}, ${inUseColumn('s')} AS inUse
    FROM seasons s${predicate(clause)}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listSeasonsAdmin(clause: ListClause, limit: number, offset: number): Promise<AdminSeason[]> {
  return (await db.all<SeasonRow>(seasonsQuery(clause, limit, offset))).map(read)
}

export async function countSeasonsAdmin(clause: ListClause): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM seasons s${predicate(clause)}`)
  return Number(row?.total ?? 0)
}

export async function seasonById(id: string): Promise<AdminSeason | undefined> {
  const [row] = await db.all<SeasonRow>(sql`SELECT ${COLUMNS}, ${inUseColumn('s')} AS inUse FROM seasons s WHERE s.id = ${id}`)
  return row ? read(row) : undefined
}

export interface SeasonOption {
  id: string
  name: string
  archived: boolean
}

// Every season in date order, for a show's own picker. A retired one is included so an
// already-assigned show still shows what it carries (D-131).
export function seasonOptionsQuery(): SQL {
  return sql`SELECT id, name, archived FROM seasons ORDER BY starts_on, name COLLATE NOCASE`
}

export async function listSeasonOptions(): Promise<SeasonOption[]> {
  const rows = await db.all<{ id: string, name: string, archived: number }>(seasonOptionsQuery())
  return rows.map(row => ({ id: row.id, name: row.name, archived: row.archived === 1 }))
}

// Both ends are included, so sharing one day is an overlap. Named, never refused (0087).
export function seasonOverlapsQuery(startsOn: string, endsOn: string, exceptId: string | null): SQL {
  const except = exceptId ? sql` AND id <> ${exceptId}` : sql``
  return sql`
    SELECT name FROM seasons
    WHERE archived = 0 AND starts_on <= ${endsOn} AND ends_on >= ${startsOn}${except}
    ORDER BY starts_on, name COLLATE NOCASE
  `
}

export async function seasonOverlaps(startsOn: string, endsOn: string, exceptId: string | null): Promise<string[]> {
  return (await db.all<{ name: string }>(seasonOverlapsQuery(startsOn, endsOn, exceptId))).map(row => row.name)
}

export interface SeasonFill { showId: string, startsAt: number, actorId: string, auditId: string }

// A show with no season takes the current one a night falls in, unless an earlier live night
// exists; once set, nothing here changes it (D-131 criterion 2). Two seasons: the later-begun.
export function fillSeasonStatements(fill: SeasonFill): SQL[] {
  const night = performanceNight(fill.startsAt)
  const season = sql`
    SELECT se.id FROM seasons se
    WHERE se.archived = 0 AND se.starts_on <= ${night} AND se.ends_on >= ${night}
    ORDER BY se.starts_on DESC, se.name COLLATE NOCASE LIMIT 1
  `
  return [
    sql`
      UPDATE shows SET season_id = (${season}), updated_at = unixepoch()
      WHERE id = ${fill.showId} AND season_id IS NULL AND EXISTS (${season})
        AND NOT EXISTS (
          SELECT 1 FROM performances p
          WHERE p.show_id = shows.id AND p.status <> 'CANCELLED' AND p.starts_at < ${fill.startsAt}
        )
    `,
    // 0049: written only if the update above changed the show.
    sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${fill.auditId}, ${fill.actorId}, 'show.updated', 'show:' || id,
             json_object('changes', json_object('seasonId', json_object('from', NULL, 'to', season_id)), 'filledFrom', ${night})
      FROM shows WHERE id = ${fill.showId} AND changes() = 1
    `,
  ]
}

// Held once whatever the capitals (D-131, echoing D-119 criterion 1).
export async function seasonNamed(name: string, exceptId?: string): Promise<AdminSeason | undefined> {
  const except = exceptId ? sql` AND s.id <> ${exceptId}` : sql``
  const [row] = await db.all<SeasonRow>(sql`
    SELECT ${COLUMNS}, ${inUseColumn('s')} AS inUse FROM seasons s WHERE s.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row ? read(row) : undefined
}
