import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { aliasColumns, whereFrom } from './list-filters'
import { showCategoriesList } from '#shared/utils/show-categories-list'
import type { SQL } from 'drizzle-orm'
import type { ListClause } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type { AdminShowCategory } from '#shared/utils/show-categories'

// Reading show categories. "In use" is a show naming this category, never a flag on the row
// (D-131 criterion 4, echoing D-119's own ticket type predicate).

export const SHOW_CATEGORY_REFERENCES = [
  { table: 'shows', column: 'category_id', why: 'a show belongs to it' },
] as const

function inUseColumn(alias: string): SQL {
  return sql`CASE WHEN EXISTS (SELECT 1 FROM shows WHERE category_id = ${sql.raw(alias)}.id) THEN 1 ELSE 0 END`
}

export function showCategoryInUseQuery(categoryId: string): SQL {
  return sql`SELECT EXISTS (SELECT 1 FROM shows WHERE category_id = ${categoryId}) AS inUse`
}

const COLUMNS = sql`
  c.id AS id,
  c.name AS name,
  c.sort AS sort,
  c.archived AS archived
`

interface ShowCategoryRow extends Omit<AdminShowCategory, 'archived' | 'inUse'> {
  archived: number
  inUse: number
}

const read = (row: ShowCategoryRow): AdminShowCategory => ({ ...row, archived: row.archived === 1, inUse: row.inUse === 1 })

export function showCategoriesClause(query: ListQuery): ListClause {
  return whereFrom(showCategoriesList, query, {
    column: aliasColumns('c'),
    search: [sql`c.name`],
  })
}

const predicate = (clause: ListClause): SQL => (clause.where ? sql` WHERE ${clause.where}` : sql``)

export function showCategoriesQuery(clause: ListClause, limit: number, offset: number): SQL {
  return sql`
    SELECT ${COLUMNS}, ${inUseColumn('c')} AS inUse
    FROM show_categories c${predicate(clause)}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listShowCategoriesAdmin(clause: ListClause, limit: number, offset: number): Promise<AdminShowCategory[]> {
  return (await db.all<ShowCategoryRow>(showCategoriesQuery(clause, limit, offset))).map(read)
}

export async function countShowCategoriesAdmin(clause: ListClause): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM show_categories c${predicate(clause)}`)
  return Number(row?.total ?? 0)
}

export async function showCategoryById(id: string): Promise<AdminShowCategory | undefined> {
  const [row] = await db.all<ShowCategoryRow>(sql`
    SELECT ${COLUMNS}, ${inUseColumn('c')} AS inUse FROM show_categories c WHERE c.id = ${id}
  `)
  return row ? read(row) : undefined
}

export interface ShowCategoryOption {
  id: string
  name: string
  archived: boolean
}

// Every category, for a show's own picker rather than the console's browse-and-manage screen. A
// retired one is included so an already-assigned show still shows what it carries (D-131).
export async function listShowCategoryOptions(): Promise<ShowCategoryOption[]> {
  const rows = await db.all<{ id: string, name: string, archived: number }>(sql`
    SELECT id, name, archived FROM show_categories ORDER BY sort, name COLLATE NOCASE
  `)
  return rows.map(row => ({ id: row.id, name: row.name, archived: row.archived === 1 }))
}

// Held once whatever the capitals (D-131, echoing D-119 criterion 1).
export async function showCategoryNamed(name: string, exceptId?: string): Promise<AdminShowCategory | undefined> {
  const except = exceptId ? sql` AND c.id <> ${exceptId}` : sql``
  const [row] = await db.all<ShowCategoryRow>(sql`
    SELECT ${COLUMNS}, ${inUseColumn('c')} AS inUse FROM show_categories c WHERE c.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row ? read(row) : undefined
}
