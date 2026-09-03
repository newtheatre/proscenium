import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { ContentWarning, ShowContentWarning } from '#shared/utils/content-warnings'
import type { SQL } from 'drizzle-orm'

// Reading the content-warning vocabulary and what each show carries of it (D-102). The correlation
// a CHECK cannot state, a level exactly when the warning is general, lives at the write path.

// Allow-listed columns rather than a whole row, so a column added later is absent from every
// payload until somebody names it here.
const COLUMNS = sql`
  w.id AS id,
  w.slug AS slug,
  w.title AS title,
  w.kind AS kind,
  w.category AS category,
  w.description AS description,
  w.icon AS icon,
  w.sort AS sort,
  w.archived AS archived
`

interface WarningRow extends Omit<ContentWarning, 'archived'> {
  archived: number
}

const readWarning = (row: WarningRow): ContentWarning => ({ ...row, archived: row.archived === 1 })

// Staging first, then the vocabulary's own order, which is the order the public page reads them
// in. Held here as well so the console lists them the way a visitor sees them.
const ORDER = sql` ORDER BY w.kind = 'GENERAL', w.sort, w.title COLLATE NOCASE`

export interface ContentWarningFilters {
  includeArchived: boolean
  search?: string
}

// A typed percent sign is a character somebody is looking for, not a wildcard.
const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// Two bound parameters at most, whatever the filters and however many entries there are (0003).
function predicate(filters: ContentWarningFilters): SQL {
  const terms: SQL[] = []
  if (!filters.includeArchived) terms.push(sql`w.archived = 0`)
  if (filters.search) terms.push(sql`(w.title LIKE ${contains(filters.search)} ESCAPE '\\' OR w.slug LIKE ${contains(filters.search)} ESCAPE '\\')`)
  return terms.length ? sql` WHERE ${sql.join(terms, sql` AND `)}` : sql``
}

export function contentWarningsQuery(filters: ContentWarningFilters, limit: number, offset: number): SQL {
  return sql`
    SELECT ${COLUMNS},
           (SELECT count(*) FROM show_content_warnings s WHERE s.warning_id = w.id) AS showCount
    FROM content_warnings w${predicate(filters)}${ORDER} LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listContentWarnings(filters: ContentWarningFilters, limit: number, offset: number): Promise<ContentWarning[]> {
  return (await db.all<WarningRow>(contentWarningsQuery(filters, limit, offset))).map(readWarning)
}

export async function countContentWarnings(filters: ContentWarningFilters): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`
    SELECT count(*) AS total FROM content_warnings w${predicate(filters)}
  `)
  return Number(row?.total ?? 0)
}

// The slug and the title are both held once: two entries called Strobe lighting are one thing to
// everybody who reads a show page.
export async function contentWarningNamed(slug: string, title: string, exceptId?: string): Promise<ContentWarning | undefined> {
  const except = exceptId ? sql` AND w.id <> ${exceptId}` : sql``
  const [row] = await db.all<WarningRow>(sql`
    SELECT ${COLUMNS}, 0 AS showCount
    FROM content_warnings w
    WHERE (w.slug = ${slug} OR w.title = ${title} COLLATE NOCASE)${except} LIMIT 1
  `)
  return row ? readWarning(row) : undefined
}

export async function contentWarningById(id: string): Promise<ContentWarning | undefined> {
  const [row] = await db.all<WarningRow>(sql`
    SELECT ${COLUMNS},
           (SELECT count(*) FROM show_content_warnings s WHERE s.warning_id = w.id) AS showCount
    FROM content_warnings w WHERE w.id = ${id}
  `)
  return row ? readWarning(row) : undefined
}

interface ShowWarningRow extends Omit<ShowContentWarning, 'archived'> {
  archived: number
}

// One show's warnings, bound by the show id alone however many it carries (0006). The vocabulary
// columns come with them, because the junction holds nothing a reader could act on.
export function showWarningsQuery(showId: string): SQL {
  return sql`
    SELECT s.id AS id,
           s.warning_id AS warningId,
           s.level AS level,
           ${COLUMNS}
    FROM show_content_warnings s
    JOIN content_warnings w ON w.id = s.warning_id
    WHERE s.show_id = ${showId}${ORDER}
  `
}

export async function showWarnings(showId: string): Promise<ShowContentWarning[]> {
  return (await db.all<ShowWarningRow>(showWarningsQuery(showId)))
    .map(row => ({ ...row, archived: row.archived === 1 }))
}

// Every warning a set of show ids carries, scoped by subquery so the listing binds one parameter
// however many shows it covers (0003, 0006).
export function warningsForListedShowsQuery(shows: SQL): SQL {
  return sql`
    SELECT s.show_id AS showId,
           s.id AS id,
           s.warning_id AS warningId,
           s.level AS level,
           ${COLUMNS}
    FROM show_content_warnings s
    JOIN content_warnings w ON w.id = s.warning_id
    WHERE s.show_id IN (${shows})${ORDER}
  `
}

// What one show may pick from: the live vocabulary, plus any archived entry it already carries so
// retiring a warning cannot rewrite a published page. Keyed by id, in the order a screen shows it.
export async function warningKinds(showId: string): Promise<Map<string, ContentWarning>> {
  const rows = await db.all<WarningRow>(sql`
    SELECT ${COLUMNS},
           (SELECT count(*) FROM show_content_warnings s WHERE s.warning_id = w.id) AS showCount
    FROM content_warnings w
    WHERE w.archived = 0
       OR w.id IN (SELECT warning_id FROM show_content_warnings WHERE show_id = ${showId})${ORDER}
  `)
  return new Map(rows.map(row => [row.id, readWarning(row)]))
}
