import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Safe to import at runtime: `capacity.ts` only imports types from this file, so no cycle exists
// the way one would if this pulled a constant back from `programme.ts` (see that file's note).
import { TICKETS_ARE_A_SALE } from './capacity'
import { aliasColumns, whereFrom } from './list-filters'
import { ticketTypesList } from '#shared/utils/ticket-types-list'
import type { SQL } from 'drizzle-orm'
import type { ListClause } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
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
  TICKETS_ARE_A_SALE,
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
  t.restricted_to AS restrictedTo,
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

export function ticketTypesClause(query: ListQuery): ListClause {
  return whereFrom(ticketTypesList, query, {
    column: aliasColumns('t'),
    search: [sql`t.name`],
  })
}

// The system row D-125's redemption ensures the first time any pass is redeemed is nobody's to
// administer: this screen sells and archives SINGLE rows, never a pass's own admission type.
const predicate = (clause: ListClause): SQL =>
  sql` WHERE ${sql.join([sql`kind = 'SINGLE'`, ...(clause.where ? [clause.where] : [])], sql` AND `)}`

export function ticketTypesQuery(clause: ListClause, limit: number, offset: number): SQL {
  return sql`
    SELECT ${COLUMNS}, ${everSoldColumn('t')} AS everSold
    FROM ticket_types t${predicate(clause)}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listTicketTypes(clause: ListClause, limit: number, offset: number): Promise<TicketType[]> {
  return (await db.all<TicketTypeRow>(ticketTypesQuery(clause, limit, offset))).map(read)
}

export async function countTicketTypes(clause: ListClause): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM ticket_types t${predicate(clause)}`)
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
