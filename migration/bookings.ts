import { nanoid } from './lib'
import type { Database } from 'bun:sqlite'

// The old rooms app's booking history, keyed to the canonical account (C-118). Utilisation
// reporting and a member's own history start with years of truth rather than an empty table.

// The old vocabulary against the new one. AWAITING_EXTERNAL has no equivalent because the unified
// system models an external room as a request the Theatre Manager answers (C-101, C-108).
export const STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING_APPROVAL',
  AWAITING_EXTERNAL: 'PENDING_APPROVAL',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
}

export const FREQUENCY_MAP: Record<string, string> = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  // The old app allowed a custom recurrence the new one does not. Its occurrences still import
  // as ordinary bookings; only the pattern is dropped, which the summary counts.
  CUSTOM: '',
}

export interface OldBooking {
  id: number
  user_id: string | null
  room_id: number | null
  external_venue_id: number | null
  event_title: string
  number_of_attendees: number | null
  start_time: number
  end_time: number
  status: string
  notes: string | null
  rejection_reason: string | null
  parent_booking_id: number | null
  occurrence_number: number | null
  created_at: number
}

export interface BookingSummary {
  read: number
  written: number
  skippedNoRoom: number
  skippedNoAccount: number
  series: number
  droppedPatterns: number
  byStatus: Record<string, number>
}

export interface TransformInput {
  // The old rooms database, read only.
  source: Database
  // Old account id to the id the identity transform minted. Nothing imports without one.
  accounts: Map<string, string>
  // Old room and external venue ids to rooms in the unified estate.
  rooms: Map<string, string>
  // Old booking id to unified id, read back before minting so a rehearsal does not duplicate.
  bookingIds: Map<string, string>
  seriesIds: Map<string, string>
  target: Database
}

// Milliseconds in the old app, seconds in this one. A timestamp read as the wrong unit lands the
// whole history in 1970, which is the sort of thing a row count would not catch.
const seconds = (ms: number): number => Math.floor(ms / 1000)

function idFor(map: Map<string, string>, key: string): string {
  const existing = map.get(key)
  if (existing) return existing
  const fresh = nanoid(32).toLowerCase().replaceAll(/[^a-z0-9]/g, '0')
  map.set(key, fresh)
  return fresh
}

export function transformBookings(input: TransformInput): { summary: BookingSummary, exceptions: string[] } {
  const { source, accounts, rooms, bookingIds, seriesIds, target } = input
  const exceptions: string[] = []
  const byStatus: Record<string, number> = {}

  const old = source.query('SELECT * FROM bookings ORDER BY id').all() as OldBooking[]
  const patterns = new Map<number, { frequency: string, days_of_week: string | null, max_occurrences: number }>()
  for (const row of source.query('SELECT * FROM recurring_patterns').all() as {
    booking_id: number
    frequency: string
    days_of_week: string | null
    max_occurrences: number
  }[]) {
    patterns.set(row.booking_id, row)
  }

  const summary: BookingSummary = {
    read: old.length,
    written: 0,
    skippedNoRoom: 0,
    skippedNoAccount: 0,
    series: 0,
    droppedPatterns: 0,
    byStatus,
  }

  // Heads first, so an occurrence always finds the series it belongs to.
  const heads = old.filter(row => row.parent_booking_id === null && patterns.has(row.id))
  for (const head of heads) {
    const pattern = patterns.get(head.id)!
    const frequency = FREQUENCY_MAP[pattern.frequency] ?? ''
    if (!frequency) {
      summary.droppedPatterns++
      exceptions.push(`booking ${head.id}: recurrence ${pattern.frequency} has no equivalent, occurrences import unlinked`)
      continue
    }

    const roomId = head.room_id !== null
      ? rooms.get(`room:${head.room_id}`)
      : rooms.get(`venue:${head.external_venue_id}`)
    const userId = head.user_id ? accounts.get(head.user_id) : undefined
    if (!roomId || !userId) continue

    const start = new Date(head.start_time)
    const seriesId = idFor(seriesIds, String(head.id))
    target.query(`
      INSERT OR REPLACE INTO room_series
        (id, user_id, room_id, title, frequency, weekdays, starts_on, clock_from, clock_to, occurrences, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      seriesId, userId, roomId, head.event_title, frequency,
      pattern.days_of_week ? String(JSON.parse(pattern.days_of_week)) : null,
      start.toISOString().slice(0, 10),
      start.toISOString().slice(11, 16),
      new Date(head.end_time).toISOString().slice(11, 16),
      pattern.max_occurrences,
      seconds(head.created_at), seconds(head.created_at),
    )
    summary.series++
  }

  for (const row of old) {
    const roomId = row.room_id !== null
      ? rooms.get(`room:${row.room_id}`)
      : rooms.get(`venue:${row.external_venue_id}`)

    if (!roomId) {
      summary.skippedNoRoom++
      exceptions.push(`booking ${row.id}: no room in the unified estate`)
      continue
    }

    // A booking whose account never made it across has nobody to belong to. Never invented: an
    // import that mints an account resurrects somebody erasure removed (criterion 3).
    const userId = row.user_id ? accounts.get(row.user_id) : undefined
    if (!userId) {
      summary.skippedNoAccount++
      exceptions.push(`booking ${row.id}: no canonical account`)
      continue
    }

    const status = STATUS_MAP[row.status]
    if (!status) {
      exceptions.push(`booking ${row.id}: unknown status ${row.status}`)
      continue
    }

    const head = row.parent_booking_id ?? (patterns.has(row.id) ? row.id : null)
    const seriesId = head !== null ? seriesIds.get(String(head)) ?? null : null

    target.query(`
      INSERT OR REPLACE INTO room_bookings
        (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, status, notes,
         rejection_reason, series_id, occurrence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'GENERAL', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      idFor(bookingIds, String(row.id)), roomId, userId, row.event_title, row.number_of_attendees,
      seconds(row.start_time), seconds(row.end_time), status, row.notes, row.rejection_reason,
      seriesId, row.occurrence_number, seconds(row.created_at), seconds(row.created_at),
    )

    byStatus[status] = (byStatus[status] ?? 0) + 1
    summary.written++
  }

  return { summary, exceptions }
}

export interface Reconciliation {
  ok: boolean
  problems: string[]
}

// Counts and a checksum, compared rather than trusted: a mismatch fails the import loudly rather
// than leaving a half-imported history nobody notices (criterion 2).
export function reconcile(source: Database, target: Database, summary: BookingSummary): Reconciliation {
  const problems: string[] = []

  const accounted = summary.written + summary.skippedNoRoom + summary.skippedNoAccount
  if (accounted !== summary.read) {
    problems.push(`read ${summary.read} bookings but accounted for ${accounted}`)
  }

  const landed = (target.query('SELECT count(*) AS n FROM room_bookings WHERE created_at > 0').get() as { n: number }).n
  if (landed < summary.written) {
    problems.push(`wrote ${summary.written} bookings but ${landed} are in the target`)
  }

  // Total booked seconds, which catches a unit error a row count never would.
  const sourceSeconds = (source.query(
    'SELECT coalesce(sum((end_time - start_time) / 1000), 0) AS total FROM bookings',
  ).get() as { total: number }).total
  const targetSeconds = (target.query(
    'SELECT coalesce(sum(ends_at - starts_at), 0) AS total FROM room_bookings',
  ).get() as { total: number }).total

  if (summary.skippedNoRoom === 0 && summary.skippedNoAccount === 0 && sourceSeconds !== targetSeconds) {
    problems.push(`booked seconds differ: ${sourceSeconds} in the source, ${targetSeconds} in the target`)
  }

  return { ok: problems.length === 0, problems }
}
