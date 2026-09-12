import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { aliasColumns, whereFrom } from './list-filters'
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
  s.sort AS sort,
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

// Every season, for a show's own picker rather than the console's browse-and-manage screen. A
// retired one is included so an already-assigned show still shows what it carries (D-131).
export async function listSeasonOptions(): Promise<SeasonOption[]> {
  const rows = await db.all<{ id: string, name: string, archived: number }>(sql`
    SELECT id, name, archived FROM seasons ORDER BY sort, name COLLATE NOCASE
  `)
  return rows.map(row => ({ id: row.id, name: row.name, archived: row.archived === 1 }))
}

// Held once whatever the capitals (D-131, echoing D-119 criterion 1).
export async function seasonNamed(name: string, exceptId?: string): Promise<AdminSeason | undefined> {
  const except = exceptId ? sql` AND s.id <> ${exceptId}` : sql``
  const [row] = await db.all<SeasonRow>(sql`
    SELECT ${COLUMNS}, ${inUseColumn('s')} AS inUse FROM seasons s WHERE s.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row ? read(row) : undefined
}
