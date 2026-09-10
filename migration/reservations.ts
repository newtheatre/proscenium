import { NOT_ANONYMISED, nanoid } from './lib'
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

// The old estate blurred a walk-up into an ordinary desk collection; DOOR is new, fixing that
// blur (docs/architecture.md). History cannot be reclassified after the fact, so both map to DESK.
export const SOURCE_MAP: Record<string, string> = {
  WEB: 'WEB',
  DESK: 'DESK',
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
  created_at: number
}

export interface OldTicket {
  id: string
  reservation_id: string
  ticket_type_id: string | null
  price_paid: number
  refunded_at: number | null
  created_at: number
  price_confidence: string
}

export interface ReservationSummary {
  read: number
  written: number
  skippedNoPerformance: number
  skippedUnknownStatus: number
  skippedUnknownSource: number
  anonymousAccount: number
  ticketsRead: number
  ticketsWritten: number
  ticketsSkippedNoType: number
  pricePaidPence: number
  byStatus: Record<string, number>
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
  // Old ticket type id to a unified ticket type, a reference map like `room-map.tsv` (#843),
  // since ticket types are authored fresh, not migrated; the same raw-id-keyed shape as performances.
  ticketTypes: Map<string, string>
  reservationIds: Map<string, string>
  ticketIds: Map<string, string>
  target: Database
}

// SQLite's CURRENT_TIMESTAMP has no zone; the dump is a UTC export, so the string is a UTC wall
// clock with a space instead of a T, the same convention `money.ts` already found.
function parseCreatedAt(value: number | string): number {
  if (typeof value === 'number') return value
  const parsed = new Date(`${value.replace(' ', 'T')}Z`)
  return Math.floor(parsed.getTime() / 1000)
}

function idFor(map: Map<string, string>, key: string): string {
  const existing = map.get(key)
  if (existing) return existing
  const fresh = nanoid(32).toLowerCase().replaceAll(/[^a-z0-9]/g, '0')
  map.set(key, fresh)
  return fresh
}

// Six characters from a small alphabet collides eventually across enough historical rows; a
// fresh draw on the rare clash beats leaving a UNIQUE violation to fail the whole batch.
function freshReference(used: Set<string>): string {
  let candidate = generateReservationReference()
  while (used.has(candidate)) candidate = generateReservationReference()
  used.add(candidate)
  return candidate
}

export function transformReservations(input: TransformInput): { summary: ReservationSummary, exceptions: string[] } {
  const { source, accounts, performances, ticketTypes, reservationIds, ticketIds, target } = input
  const exceptions: string[] = []
  const byStatus: Record<string, number> = {}
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
    anonymousAccount: 0,
    ticketsRead: oldTickets.length,
    ticketsWritten: 0,
    ticketsSkippedNoType: 0,
    pricePaidPence: 0,
    byStatus,
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

    for (const ticket of ticketsByReservation.get(row.id) ?? []) {
      const ticketTypeId = ticket.ticket_type_id !== null ? ticketTypes.get(ticket.ticket_type_id) : undefined
      if (!ticketTypeId) {
        summary.ticketsSkippedNoType++
        exceptions.push(`ticket ${ticket.id} (reservation ${row.id}): no ticket type (old id ${ticket.ticket_type_id ?? 'none recorded'})`)
        continue
      }
      if (ticket.price_confidence !== 'EXACT') {
        exceptions.push(`ticket ${ticket.id}: price_confidence "${ticket.price_confidence}", not EXACT: reconcile by hand`)
      }

      const refundedAt = ticket.refunded_at !== null ? parseCreatedAt(ticket.refunded_at) : null
      insertTicket.run(idFor(ticketIds, String(ticket.id)), id, performanceId, ticketTypeId, ticket.price_paid, refundedAt)
      summary.ticketsWritten++
      summary.pricePaidPence += ticket.price_paid
    }
  }

  return { summary, exceptions }
}

export interface Reconciliation {
  ok: boolean
  problems: string[]
}

// Row counts and a money total, compared rather than trusted (the same discipline `bookings.ts`
// and `money.ts` both keep): a mismatch fails loudly rather than leaving a partial history.
export function reconcile(source: Database, target: Database, summary: ReservationSummary): Reconciliation {
  const problems: string[] = []

  const accounted = summary.written + summary.skippedNoPerformance + summary.skippedUnknownStatus + summary.skippedUnknownSource
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
