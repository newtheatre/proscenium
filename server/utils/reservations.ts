import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import { newId } from './accounts'
import { heldSeatsQuery, ticketInsertQueries } from './capacity'
import { auditEntry } from '#shared/utils/audit'
import { normaliseEmail } from '#shared/utils/auth'
import { capacityRefusal } from '#shared/utils/capacity'
import { generateReservationReference } from '#shared/utils/reservations'
import { resolvePrice } from '#shared/utils/ticket-types'
import type { TicketToWrite } from './capacity'
import type { CapacityRefusal } from '#shared/utils/capacity'
import type { ReservationSource } from '#shared/utils/reservations'
import type { PriceSource } from '#shared/utils/ticket-types'
import type { SQL } from 'drizzle-orm'

// Resolving what a performance may sell and writing what it sold (D-104). The predicate that
// gates capacity is D-105's; this is the one place that assembles an order against it.

export interface BookableTicketTypeRow {
  id: string
  name: string
  description: string | null
  basePrice: number
  activeByDefault: number
  showPrice: number | null
  showActive: number | null
  performancePrice: number | null
  performanceActive: number | null
}

export interface BookableTicketType {
  id: string
  name: string
  description: string | null
  price: number
  source: PriceSource
}

const readFlag = (value: number | null): boolean | null => (value === null ? null : value === 1)

// Active, publicly listed types resolved down the same chain the listing reads, so a quoted
// price can never differ from what the write path charges. Pure, so it needs no database.
export function readBookableTicketTypes(rows: BookableTicketTypeRow[]): BookableTicketType[] {
  return rows.flatMap((row) => {
    const resolved = resolvePrice(
      { price: row.basePrice, activeByDefault: row.activeByDefault === 1 },
      row.showPrice === null && row.showActive === null ? null : { price: row.showPrice, active: readFlag(row.showActive) },
      row.performancePrice === null && row.performanceActive === null
        ? null
        : { price: row.performancePrice, active: readFlag(row.performanceActive) },
    )
    if (!resolved.active) return []
    return [{ id: row.id, name: row.name, description: row.description, price: resolved.price, source: resolved.source }]
  })
}

export function bookableTicketTypesQuery(performanceId: string, showId: string): SQL {
  return sql`
    SELECT t.id AS id, t.name AS name, t.description AS description, t.price AS basePrice,
           t.active_by_default AS activeByDefault,
           so.price AS showPrice, so.active AS showActive,
           po.price AS performancePrice, po.active AS performanceActive
    FROM ticket_types t
    LEFT JOIN show_ticket_overrides so ON so.show_id = ${showId} AND so.ticket_type_id = t.id
    LEFT JOIN performance_ticket_overrides po ON po.performance_id = ${performanceId} AND po.ticket_type_id = t.id
    WHERE t.archived = 0 AND t.access_kind IS NULL AND t.kind = 'SINGLE'
    ORDER BY t.price, t.name COLLATE NOCASE
  `
}

export async function bookableTicketTypes(performanceId: string, showId: string): Promise<BookableTicketType[]> {
  return readBookableTicketTypes(await db.all<BookableTicketTypeRow>(bookableTicketTypesQuery(performanceId, showId)))
}

export interface ReservationLineToWrite {
  ticketTypeId: string
  quantity: number
  pricePaid: number
  priceSource: PriceSource
}

export interface WriteReservationInput {
  performanceId: string
  userId: string | null
  source: ReservationSource
  // True only for a desk booking made after the customer window had already closed
  // (D-112 criterion 3); every other channel writes false.
  windowBypassed: boolean
  lines: ReservationLineToWrite[]
  capacity: number | null
}

export interface WrittenTicket {
  id: string
  ticketTypeId: string
  pricePaid: number
}

export interface WriteReservationResult {
  reference: string
  // The tickets the batch actually wrote: fewer than requested means the capacity predicate on
  // at least one statement did not match, and the whole order wrote none of itself (D-105).
  tickets: WrittenTicket[]
  requested: number
}

export interface GuestAccountResult {
  id: string
  created: boolean
}

// An existing address, guest or full, is reused as it stands; a new one is a claimable guest
// account (D-104 criteria 1, 6). The reservation succeeds identically either way (enumeration-safe).
export async function guestAccount(email: string, name: string): Promise<GuestAccountResult> {
  const normalised = normaliseEmail(email)
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.email, normalised)).limit(1)
  if (existing) return { id: existing.id, created: false }

  const id = newId()
  const entry = auditEntry({ actorId: null, action: 'account.created.guest', target: `user:${id}` })
  await db.batch([
    db.insert(schema.users).values({ id, email: normalised, name: name.trim() }),
    db.insert(schema.auditLog).values(entry),
  ])
  return { id, created: true }
}

// Every ticket statement carries the identical capacity condition: all match or none does
// (D-104 criterion 3, D-105 criterion 1). The reservation row is unconditional; the caller decides.
export async function writeReservation(input: WriteReservationInput): Promise<WriteReservationResult> {
  const id = newId()
  const reference = generateReservationReference()

  const tickets: (TicketToWrite & { ticketTypeId: string })[] = input.lines.flatMap(line =>
    Array.from({ length: line.quantity }, () => ({
      id: newId(),
      reservationId: id,
      performanceId: input.performanceId,
      ticketTypeId: line.ticketTypeId,
      pricePaid: line.pricePaid,
      priceSource: line.priceSource,
    })))

  const reservationInsert = sql`
    INSERT INTO reservations (id, reference, performance_id, user_id, status, source, window_bypassed)
    VALUES (${id}, ${reference}, ${input.performanceId}, ${input.userId}, 'PENDING', ${input.source}, ${input.windowBypassed})
  `

  const [, ...ticketRows] = await db.batch([
    db.run(reservationInsert),
    ...ticketInsertQueries(tickets, input.capacity).map(statement => db.all<{ id: string }>(statement)),
  ])

  const written: WrittenTicket[] = []
  for (const [index, rows] of ticketRows.entries()) {
    if (rows.length > 0) {
      const ticket = tickets[index]!
      written.push({ id: rows[0]!.id, ticketTypeId: ticket.ticketTypeId, pricePaid: ticket.pricePaid })
    }
  }

  return { reference, tickets: written, requested: tickets.length }
}

// The message a refused order quotes, read fresh after the batch: the decision already happened
// atomically inside it, so this is only ever for what the response tells the booker.
export async function currentCapacityRefusal(performanceId: string, capacity: number | null, wanted: number): Promise<CapacityRefusal | null> {
  const [row] = await db.all<{ held: number }>(heldSeatsQuery(performanceId))
  return capacityRefusal(capacity, Number(row?.held ?? 0), wanted)
}
