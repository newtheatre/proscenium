import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PassType, PassTypeStatus } from '#shared/utils/pass-types'

// "Ever issued" and "live coverage" (D-123 criteria 3 and 4) have no real answer until D-124
// builds `passes`, so both read an empty registry until then (as ticket-types.ts did for D-119).

export interface PassTypeReference {
  table: string
  column: string
  issued: boolean
  why: string
}

export const PASS_TYPE_REFERENCES: PassTypeReference[] = [
  {
    table: 'pass_type_prices',
    column: 'pass_type_id',
    issued: false,
    why: 'a price point this pass would sell at: configuration, and nobody has bought anything',
  },
  {
    table: 'pass_type_shows',
    column: 'pass_type_id',
    issued: false,
    why: 'a show this pass covers: configuration, not an issued pass',
  },
]

export function issuedReferences(references = PASS_TYPE_REFERENCES): PassTypeReference[] {
  return references.filter(reference => reference.issued)
}

// A correlated EXISTS per issued table, binding nothing: the parameter count is fixed however
// many pass types or passes exist (0003, 0006).
export function everIssuedColumn(alias: string, references = issuedReferences()): SQL {
  if (references.length === 0) return sql`0`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${sql.raw(alias)}.id)`)
  return sql`CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END`
}

export function everIssuedQuery(passTypeId: string, references = issuedReferences()): SQL {
  if (references.length === 0) return sql`SELECT 0 AS everIssued`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${passTypeId})`)
  return sql`SELECT CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END AS everIssued`
}

// D-124 adds a row here once `passes` exists, counting only the ones still live for that show.
// Empty until then, so removing a covered show is never manager-gated before anything holds one.
export interface PassCoverageReference {
  table: string
  liveCount: (passTypeId: SQL, showId: SQL) => SQL
  why: string
}

export const PASS_COVERAGE_REFERENCES: PassCoverageReference[] = []

// How many live passes of this type cover this one show, bound by two parameters whatever the
// registry holds (D-123 criterion 4).
export function liveCoverageQuery(passTypeId: string, showId: string, references = PASS_COVERAGE_REFERENCES): SQL {
  if (references.length === 0) return sql`SELECT 0 AS live`
  const terms = references.map(reference => reference.liveCount(sql`${passTypeId}`, sql`${showId}`))
  return sql`SELECT ${sql.join(terms, sql` + `)} AS live`
}

interface PassTypeRow {
  id: string
  slug: string
  name: string
  description: string | null
  status: PassTypeStatus
  validFrom: number
  validUntil: number
  salesOpenAt: number | null
  salesCloseAt: number | null
  maxIssued: number | null
  everIssued: number
  pricesJson: string
  showIdsJson: string
}

function read(row: PassTypeRow): PassType {
  const prices = JSON.parse(row.pricesJson) as { id: string, label: string, price: number }[]
  const showIds = JSON.parse(row.showIdsJson) as string[]
  return {
    ...row,
    everIssued: row.everIssued === 1,
    prices: prices.filter(price => price.id !== null),
    showIds: showIds.filter(id => id !== null),
  }
}

// Every column the console reads, prices and covered shows in their own correlated subqueries so
// no join multiplies the pass type row and no parameter count depends on rows (0003, 0006).
const COLUMNS = sql`
  t.id AS id,
  t.slug AS slug,
  t.name AS name,
  t.description AS description,
  t.status AS status,
  t.valid_from AS validFrom,
  t.valid_until AS validUntil,
  t.sales_open_at AS salesOpenAt,
  t.sales_close_at AS salesCloseAt,
  t.max_issued AS maxIssued,
  COALESCE((
    SELECT json_group_array(json_object('id', p.id, 'label', p.label, 'price', p.price))
    FROM pass_type_prices p WHERE p.pass_type_id = t.id
  ), '[]') AS pricesJson,
  COALESCE((
    SELECT json_group_array(s.show_id)
    FROM pass_type_shows s WHERE s.pass_type_id = t.id
  ), '[]') AS showIdsJson
`

export interface PassTypeFilters {
  status?: PassTypeStatus
  search?: string
}

const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// Two bound parameters at most, whatever the filters and however many pass types there are (0003).
function predicate(filters: PassTypeFilters): SQL {
  const terms: SQL[] = []
  if (filters.status) terms.push(sql`t.status = ${filters.status}`)
  if (filters.search) terms.push(sql`t.name LIKE ${contains(filters.search)} ESCAPE '\\'`)
  return terms.length ? sql` WHERE ${sql.join(terms, sql` AND `)}` : sql``
}

export function passTypesQuery(filters: PassTypeFilters, limit: number, offset: number, references = issuedReferences()): SQL {
  return sql`
    SELECT ${COLUMNS}, ${everIssuedColumn('t', references)} AS everIssued
    FROM pass_types t${predicate(filters)}
    ORDER BY t.status, t.name COLLATE NOCASE
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listPassTypes(filters: PassTypeFilters, limit: number, offset: number): Promise<PassType[]> {
  return (await db.all<PassTypeRow>(passTypesQuery(filters, limit, offset))).map(read)
}

export async function countPassTypes(filters: PassTypeFilters): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM pass_types t${predicate(filters)}`)
  return Number(row?.total ?? 0)
}

export async function passTypeById(id: string): Promise<PassType | undefined> {
  const [row] = await db.all<PassTypeRow>(sql`
    SELECT ${COLUMNS}, ${everIssuedColumn('t')} AS everIssued FROM pass_types t WHERE t.id = ${id}
  `)
  return row ? read(row) : undefined
}

// Held once, so the write path can quote what already has the address rather than reaching the
// unique index blind.
export async function passTypeBySlug(slug: string, exceptId?: string): Promise<PassType | undefined> {
  const except = exceptId ? sql` AND t.id <> ${exceptId}` : sql``
  const [row] = await db.all<PassTypeRow>(sql`
    SELECT ${COLUMNS}, ${everIssuedColumn('t')} AS everIssued
    FROM pass_types t WHERE t.slug = ${slug}${except} LIMIT 1
  `)
  return row ? read(row) : undefined
}
