import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { TicketType } from '#shared/utils/ticket-types'

// Reading ticket types, and the one predicate D-119 criterion 2 turns on. "Has ever been sold" is
// a question about rows in other tables, never a flag on this one.

// Every table that points at `ticket_types`, each declared as a sale or not. A new referencing
// table joins this list or `tests/integration/ticket-types.test.ts` fails (D-119 criterion 2).
export interface TicketTypeReference {
  table: string
  column: string
  // True when a row here means a seat was sold under this type, so the type may only be archived.
  sale: boolean
  why: string
}

export const TICKET_TYPE_REFERENCES: TicketTypeReference[] = [
  {
    table: 'show_ticket_overrides',
    column: 'ticket_type_id',
    sale: false,
    why: 'a price this type would take on one show: configuration, and nobody has bought anything',
  },
  {
    table: 'performance_ticket_overrides',
    column: 'ticket_type_id',
    sale: false,
    why: 'a price this type would take on one performance: configuration, not a sale',
  },
]

export function saleReferences(references = TICKET_TYPE_REFERENCES): TicketTypeReference[] {
  return references.filter(reference => reference.sale)
}

// A correlated EXISTS per sale table, binding nothing: the parameter count is fixed however many
// types or tickets exist (0003, 0006).
export function everSoldColumn(alias: string, references = saleReferences()): SQL {
  if (references.length === 0) return sql`0`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${sql.raw(alias)}.id)`)
  return sql`CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END`
}

// The same question about one type, bound by its id. One parameter per sale table, and no list.
export function everSoldQuery(ticketTypeId: string, references = saleReferences()): SQL {
  if (references.length === 0) return sql`SELECT 0 AS sold`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${ticketTypeId})`)
  return sql`SELECT CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END AS sold`
}

// Allow-listed columns rather than a whole row: an archived type still has to resolve for every
// historical ticket, report and export, and none of them wants an internal column (D-119).
const COLUMNS = sql`
  t.id AS id,
  t.name AS name,
  t.description AS description,
  t.price AS price,
  t.kind AS kind,
  t.access_kind AS accessKind,
  t.archived AS archived,
  t.active_by_default AS activeByDefault
`

interface TicketTypeRow extends Omit<TicketType, 'archived' | 'activeByDefault' | 'everSold'> {
  archived: number
  activeByDefault: number
  everSold: number
}

const read = (row: TicketTypeRow): TicketType => ({
  ...row,
  archived: row.archived === 1,
  activeByDefault: row.activeByDefault === 1,
  everSold: row.everSold === 1,
})

export interface TicketTypeFilters {
  includeArchived: boolean
  search?: string
}

// A typed percent sign is a character somebody is looking for, not a wildcard.
const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// Two bound parameters at most, whatever the filters and however many types there are (0003).
function predicate(filters: TicketTypeFilters): SQL {
  const terms: SQL[] = []
  if (!filters.includeArchived) terms.push(sql`archived = 0`)
  // SQLite's LIKE is case-insensitive over ASCII already, and a COLLATE here would bind to the
  // escape character rather than to the comparison.
  if (filters.search) terms.push(sql`name LIKE ${contains(filters.search)} ESCAPE '\\'`)
  return terms.length ? sql` WHERE ${sql.join(terms, sql` AND `)}` : sql``
}

export function ticketTypesQuery(filters: TicketTypeFilters, limit: number, offset: number): SQL {
  return sql`
    SELECT ${COLUMNS}, ${everSoldColumn('t')} AS everSold
    FROM ticket_types t${predicate(filters)}
    ORDER BY t.archived, t.name COLLATE NOCASE
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listTicketTypes(filters: TicketTypeFilters, limit: number, offset: number): Promise<TicketType[]> {
  return (await db.all<TicketTypeRow>(ticketTypesQuery(filters, limit, offset))).map(read)
}

export async function countTicketTypes(filters: TicketTypeFilters): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM ticket_types${predicate(filters)}`)
  return Number(row?.total ?? 0)
}

export async function ticketTypeById(id: string): Promise<TicketType | undefined> {
  const [row] = await db.all<TicketTypeRow>(sql`
    SELECT ${COLUMNS}, ${everSoldColumn('t')} AS everSold FROM ticket_types t WHERE t.id = ${id}
  `)
  return row ? read(row) : undefined
}

// Held once whatever the capitals: two types called Standard and standard are one name to
// everybody who reads a report (D-119 criterion 1).
export async function ticketTypeNamed(name: string, exceptId?: string): Promise<TicketType | undefined> {
  const except = exceptId ? sql` AND t.id <> ${exceptId}` : sql``
  const [row] = await db.all<TicketTypeRow>(sql`
    SELECT ${COLUMNS}, ${everSoldColumn('t')} AS everSold
    FROM ticket_types t WHERE t.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row ? read(row) : undefined
}
