import { NOT_ANONYMISED, idFor, parseStamp } from './lib'
import { generateReservationReference } from '../shared/utils/reservations'
import type { Database } from 'bun:sqlite'

// The old estate's reservations and tickets, structured records K-114's own ledger totals lack.
// Reservations scrub on erasure rather than delete, so only the conflict branch is guarded (0059).

// A stale hold could not still be PENDING years later; it never converted, so it reads the same
// as one the release sweep would have expired had it ever run (D-106).
export const STATUS_MAP: Record<string, string> = {
  PENDING: 'EXPIRED',
  COLLECTED: 'COLLECTED',
  DOOR: 'DOOR',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
}

// The old estate's first import stamped its own rows LEGACY_IMPORT; the desk is the nearest
// honest channel for a booking whose channel nobody recorded (docs/known-issues.md).
export const SOURCE_MAP: Record<string, string> = {
  WEB: 'WEB',
  DESK: 'DESK',
  DOOR: 'DOOR',
  LEGACY_IMPORT: 'DESK',
}

export interface OldReservation {
  id: string
  user_id: string | null
  performance_id: string | null
  status: string
  source: string
  customer_notes: string | null
  staff_notes: string | null
  cancelled_by: string | null
  created_at: number | string
}

export interface OldTicket {
  id: string
  reservation_id: string
  ticket_type_id: string | null
  price_paid: number
  refunded_at: number | null
  created_at: number | string
  price_confidence: string
}

export interface ReservationSummary {
  read: number
  written: number
  skippedNoPerformance: number
  skippedUnknownStatus: number
  skippedUnknownSource: number
  skippedPassSaleOnly: number
  legacySourced: number
  anonymousAccount: number
  ticketsRead: number
  ticketsWritten: number
  ticketsSkippedNoType: number
  passSales: number
  passAdmissions: number
  negativePriceClamped: number
  pricePaidPence: number
  byStatus: Record<string, number>
  // Counted, not listed: a line per ticket naming its confidence would drown every real exception.
  byConfidence: Record<string, number>
}

// What passes.ts reconstructs from (0073): a sale is not a seat, an admission is a seat spent.
export interface PassSale {
  oldTicketId: string
  oldTicketTypeId: string
  userId: string | null
  pricePaid: number
  soldAt: number
}

export interface PassAdmissionSeat {
  oldTicketId: string
  oldTicketTypeId: string
  ticketId: string
  performanceId: string
  userId: string | null
  admittedAt: number
}

export interface TransformInput {
  // The old proscenium database, read only.
  source: Database
  // Old account id to the id identity minted. A guest account imports the same way a full one
  // does (K-112): nothing here tests for a password, only whether the id resolved.
  accounts: Map<string, string>
  // Old performance id to a unified performance (the programme transform's own map, keyed on
  // its raw old id, not prefixed); empty until it exists, which every row here accounts for.
  performances: Map<string, string>
  // Old ticket type id to a unified ticket type, minted by the catalogue transform (0075).
  ticketTypes: Map<string, string>
  reservationIds: Map<string, string>
  ticketIds: Map<string, string>
  // Old ticket types that were really pass sales or pass admissions, and the one unified row
  // every admission lands on (0073, 0074). Empty means the estate sold no passes.
  passSaleTypes?: Set<string>
  passAdmissionTypes?: Set<string>
  passAdmissionTicketTypeId?: string | null
  target: Database
}

// SQLite's CURRENT_TIMESTAMP has no zone; the dump is a UTC export, so the string is a UTC wall
// clock with a space instead of a T, the same convention `money.ts` already found.
export function parseCreatedAt(value: number | string): number {
  return parseStamp(value) ?? 0
}

// Six characters from a small alphabet collides eventually across enough historical rows; a
// fresh draw on the rare clash beats leaving a UNIQUE violation to fail the whole batch.
function freshReference(used: Set<string>): string {
  let candidate = generateReservationReference()
  while (used.has(candidate)) candidate = generateReservationReference()
  used.add(candidate)
  return candidate
}

export interface ReservationResult {
  summary: ReservationSummary
  exceptions: string[]
  passSales: PassSale[]
  passAdmissions: PassAdmissionSeat[]
}

export function transformReservations(input: TransformInput): ReservationResult {
  const { source, accounts, performances, ticketTypes, reservationIds, ticketIds, target } = input
  const passSaleTypes = input.passSaleTypes ?? new Set<string>()
  const passAdmissionTypes = input.passAdmissionTypes ?? new Set<string>()
  const passAdmissionTicketTypeId = input.passAdmissionTicketTypeId ?? null
  const exceptions: string[] = []
  const passSales: PassSale[] = []
  const passAdmissions: PassAdmissionSeat[] = []
  const byStatus: Record<string, number> = {}
  const byConfidence: Record<string, number> = {}
  const usedReferences = new Set<string>(
    target.query<{ reference: string }, []>('SELECT reference FROM reservations').all().map(row => row.reference),
  )

  const oldReservations = source.query<OldReservation, []>('SELECT * FROM reservations ORDER BY id').all()
  const oldTickets = source.query<OldTicket, []>('SELECT * FROM tickets ORDER BY id').all()
  const ticketsByReservation = new Map<string, OldTicket[]>()
  for (const ticket of oldTickets) {
    const list = ticketsByReservation.get(ticket.reservation_id) ?? []
    list.push(ticket)
    ticketsByReservation.set(ticket.reservation_id, list)
  }

  const summary: ReservationSummary = {
    read: oldReservations.length,
    written: 0,
    skippedNoPerformance: 0,
    skippedUnknownStatus: 0,
    skippedUnknownSource: 0,
    skippedPassSaleOnly: 0,
    legacySourced: 0,
    anonymousAccount: 0,
    ticketsRead: oldTickets.length,
    ticketsWritten: 0,
    ticketsSkippedNoType: 0,
    passSales: 0,
    passAdmissions: 0,
    negativePriceClamped: 0,
    pricePaidPence: 0,
    byStatus,
    byConfidence,
  }

  const insertReservation = target.prepare(`
    INSERT INTO reservations
      (id, reference, performance_id, user_id, status, source, hold_expires_at, cancelled_by,
       customer_notes, staff_notes, window_bypassed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      performance_id = excluded.performance_id, user_id = excluded.user_id, status = excluded.status,
      source = excluded.source, cancelled_by = excluded.cancelled_by,
      customer_notes = excluded.customer_notes, staff_notes = excluded.staff_notes,
      updated_at = excluded.updated_at
    WHERE ${NOT_ANONYMISED('reservations')}
  `)

  // No guard here (0059): tickets carry no personal-data.ts entry of their own, naming nobody
  // directly, and a reservation already anonymised keeps its tickets exactly as bookings do.
  const insertTicket = target.prepare(`
    INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source, refunded_at)
    VALUES (?, ?, ?, ?, ?, 'IMPORT', ?)
    ON CONFLICT (id) DO UPDATE SET
      reservation_id = excluded.reservation_id, performance_id = excluded.performance_id,
      ticket_type_id = excluded.ticket_type_id, price_paid = excluded.price_paid,
      refunded_at = excluded.refunded_at
  `)

  for (const row of oldReservations) {
    // Everything record-like keys to a performance; performance_id is not nullable, so an
    // unlinked or unmapped one cannot become a row here at all, named rather than dropped.
    const performanceId = row.performance_id !== null ? performances.get(row.performance_id) : undefined
    if (!performanceId) {
      summary.skippedNoPerformance++
      exceptions.push(`reservation ${row.id}: no performance (old id ${row.performance_id ?? 'none recorded'})`)
      continue
    }

    const status = STATUS_MAP[row.status]
    if (!status) {
      summary.skippedUnknownStatus++
      exceptions.push(`reservation ${row.id}: unknown status ${row.status}`)
      continue
    }

    const source_ = SOURCE_MAP[row.source]
    if (!source_) {
      summary.skippedUnknownSource++
      exceptions.push(`reservation ${row.id}: unknown source ${row.source}`)
      continue
    }
    if (row.source === 'LEGACY_IMPORT') summary.legacySourced++

    // Nullable by design (docs/data-model.md): an old reservation naming nobody, or naming
    // somebody whose own account never came across, still holds real ticket history.
    let userId: string | null = null
    if (row.user_id) {
      userId = accounts.get(row.user_id) ?? null
      if (userId === null) {
        summary.anonymousAccount++
        exceptions.push(`reservation ${row.id}: account ${row.user_id} has no canonical id, imported without one`)
      }
    }

    const tickets = ticketsByReservation.get(row.id) ?? []
    for (const ticket of tickets) {
      if (ticket.price_confidence !== 'EXACT') byConfidence[ticket.price_confidence] = (byConfidence[ticket.price_confidence] ?? 0) + 1
    }

    // A pass sale held no seat at the performance the desk happened to key it against; it
    // becomes a pass (passes.ts), and a reservation holding nothing else is not a reservation.
    const sales = tickets.filter(ticket => ticket.ticket_type_id !== null && passSaleTypes.has(ticket.ticket_type_id))
    for (const ticket of sales) {
      passSales.push({
        oldTicketId: ticket.id, oldTicketTypeId: ticket.ticket_type_id!, userId,
        pricePaid: Math.max(ticket.price_paid, 0), soldAt: parseCreatedAt(ticket.created_at),
      })
      summary.passSales++
      if (ticket.price_paid < 0) summary.negativePriceClamped++
    }
    const seats = tickets.filter(ticket => !sales.includes(ticket))
    if (sales.length && !seats.length) {
      summary.skippedPassSaleOnly++
      continue
    }

    const id = idFor(reservationIds, String(row.id))
    const createdAt = parseCreatedAt(row.created_at)
    // A re-run keeps the reference a previous rehearsal already minted (`reference` is absent
    // from the conflict branch's own SET list below, so this value only ever applies on insert).
    const existing = target.query('SELECT reference FROM reservations WHERE id = ?').get(id) as { reference: string } | null
    const reference = existing?.reference ?? freshReference(usedReferences)

    insertReservation.run(
      id, reference, performanceId, userId, status, source_,
      row.cancelled_by, row.customer_notes, row.staff_notes, createdAt, createdAt,
    )
    byStatus[status] = (byStatus[status] ?? 0) + 1
    summary.written++

    for (const ticket of seats) {
      const admission = ticket.ticket_type_id !== null && passAdmissionTypes.has(ticket.ticket_type_id)
      const ticketTypeId = admission
        ? passAdmissionTicketTypeId
        : (ticket.ticket_type_id !== null ? ticketTypes.get(ticket.ticket_type_id) : undefined)
      if (!ticketTypeId) {
        summary.ticketsSkippedNoType++
        exceptions.push(`ticket ${ticket.id} (reservation ${row.id}): no ticket type (old id ${ticket.ticket_type_id ?? 'none recorded'})`)
        continue
      }

      // The schema refuses a negative seat price; the estate holds two. Clamped and counted, and
      // money.ts clamps the same rows so the ledger and the seats agree.
      let pricePaid = ticket.price_paid
      if (pricePaid < 0) {
        summary.negativePriceClamped++
        pricePaid = 0
      }
      const refundedAt = ticket.refunded_at !== null ? parseCreatedAt(ticket.refunded_at) : null
      const ticketId = idFor(ticketIds, String(ticket.id))
      insertTicket.run(ticketId, id, performanceId, ticketTypeId, pricePaid, refundedAt)
      summary.ticketsWritten++
      summary.pricePaidPence += pricePaid

      if (admission) {
        passAdmissions.push({
          oldTicketId: ticket.id, oldTicketTypeId: ticket.ticket_type_id!, ticketId, performanceId, userId,
          admittedAt: parseCreatedAt(ticket.created_at),
        })
        summary.passAdmissions++
      }
    }
  }

  return { summary, exceptions, passSales, passAdmissions }
}

export interface Reconciliation {
  ok: boolean
  problems: string[]
}

// Row counts and a money total, compared rather than trusted (the same discipline `bookings.ts`
// and `money.ts` both keep): a mismatch fails loudly rather than leaving a partial history.
export function reconcile(source: Database, target: Database, summary: ReservationSummary): Reconciliation {
  const problems: string[] = []

  const accounted = summary.written + summary.skippedNoPerformance + summary.skippedUnknownStatus
    + summary.skippedUnknownSource + summary.skippedPassSaleOnly
  if (accounted !== summary.read) {
    problems.push(`read ${summary.read} reservations but accounted for ${accounted}`)
  }

  const landed = (target.query('SELECT count(*) AS n FROM reservations WHERE created_at > 0').get() as { n: number }).n
  if (landed < summary.written) {
    problems.push(`wrote ${summary.written} reservations but ${landed} are in the target`)
  }

  const ticketsLanded = (target.query('SELECT count(*) AS n FROM tickets').get() as { n: number }).n
  if (ticketsLanded < summary.ticketsWritten) {
    problems.push(`wrote ${summary.ticketsWritten} tickets but ${ticketsLanded} are in the target`)
  }

  const targetPricePaid = (target.query('SELECT coalesce(sum(price_paid), 0) AS total FROM tickets').get() as { total: number }).total
  if (summary.ticketsSkippedNoType === 0 && targetPricePaid !== summary.pricePaidPence) {
    problems.push(`price paid differs: ${summary.pricePaidPence}p transformed, ${targetPricePaid}p in the target`)
  }

  return { ok: problems.length === 0, problems }
}
