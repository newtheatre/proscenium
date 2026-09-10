import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING, 0055).
import { TICKET_EXPORT_CAP } from '#shared/utils/ticket-export'
import type { ReservationSource } from '#shared/utils/reservations'
import type { ReservationStatus } from '#shared/utils/capacity'
import type { SQL } from 'drizzle-orm'

// D-129 criterion 3's whole column list, explicit: no customer name, no notes of either kind, no
// access-profile data, ever reaches this query.

export interface TicketExportFilter {
  showId?: string
  performanceId?: string
  source?: ReservationSource
  fromAt?: number
  toAt?: number
}

export interface TicketExportRow {
  reference: string
  showTitle: string
  startsAt: number
  typeName: string
  pricePaid: number
  source: ReservationSource
  status: ReservationStatus
  refundedAt: number | null
}

function predicate(filter: TicketExportFilter): SQL {
  const terms: SQL[] = []
  if (filter.showId) terms.push(sql`sh.id = ${filter.showId}`)
  if (filter.performanceId) terms.push(sql`t.performance_id = ${filter.performanceId}`)
  if (filter.source) terms.push(sql`r.source = ${filter.source}`)
  if (filter.fromAt !== undefined) terms.push(sql`p.starts_at >= ${filter.fromAt}`)
  if (filter.toAt !== undefined) terms.push(sql`p.starts_at < ${filter.toAt}`)
  return terms.length ? sql` WHERE ${sql.join(terms, sql` AND `)}` : sql``
}

// One row per seat, oldest performance first. `limit` is fetched one over the real cap, so the
// caller can tell "exactly at the cap" from "more exists" without a separate count query.
export function ticketExportQuery(filter: TicketExportFilter, limit = TICKET_EXPORT_CAP): SQL {
  return sql`
    SELECT r.reference AS reference, sh.title AS showTitle, p.starts_at AS startsAt,
           tt.name AS typeName, t.price_paid AS pricePaid, r.source AS source,
           r.status AS status, t.refunded_at AS refundedAt
    FROM tickets t
    JOIN reservations r ON r.id = t.reservation_id
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    JOIN performances p ON p.id = t.performance_id
    JOIN shows sh ON sh.id = p.show_id${predicate(filter)}
    ORDER BY p.starts_at ASC, r.reference ASC
    LIMIT ${limit + 1}
  `
}

export async function ticketExportRows(filter: TicketExportFilter, limit = TICKET_EXPORT_CAP): Promise<TicketExportRow[]> {
  return db.all<TicketExportRow>(ticketExportQuery(filter, limit))
}
