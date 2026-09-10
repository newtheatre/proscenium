import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { newId } from './accounts'
import { auditedWrite } from './audit'
import { hasCurrentMembership } from './bookings'
import { heldSeatsQuery } from './capacity'
import { configValue } from './configuration'
import { effectiveCapacity } from './performances'
import { performanceNight } from './performances'
import { performanceById } from './programme'
import { bookableTicketTypes, writeReservation } from './reservations'
import { auditEntry } from '#shared/utils/audit'
import { saleRefusal } from '#shared/utils/programme'
import { bornExpiredReason, holdExpiresAt, resolveHoldReleaseMinutes, totalTickets } from '#shared/utils/reservations'
import { showNightBounds } from '#shared/utils/show-night'
import { offerExpiresAt, offerWouldBeBornExpired, partySizeMismatchReason } from '#shared/utils/waiting-list'
import type { ReservationLineToWrite, WriteReservationResult } from './reservations'
import type { BatchItem } from 'drizzle-orm/batch'
import type { ClaimWaitingListOfferInput, WaitingListStatus } from '#shared/utils/waiting-list'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// D-113: joining, offering, claiming, lapsing, removing and purging a waiting-list entry. The
// claim step is the one place this file calls into D-104's own write path (`writeReservation`).

export interface JoinWaitingListWriteInput {
  performanceId: string
  userId: string
  partySize: number
}

export interface JoinWaitingListResult {
  id: string
  joined: boolean
}

// The active-only unique index is the refusal (criterion 1): a second join while one entry is
// still `WAITING` or `OFFERED` inserts nothing, and this reads that back rather than checking first.
export function joinEntryStatement(id: string, performanceId: string, userId: string, partySize: number): SQL {
  return sql`
    INSERT INTO waiting_list (id, performance_id, user_id, party_size, status)
    VALUES (${id}, ${performanceId}, ${userId}, ${partySize}, 'WAITING')
    ON CONFLICT (performance_id, user_id) WHERE status IN ('WAITING', 'OFFERED') DO NOTHING
    RETURNING id
  `
}

export async function joinWaitingList(input: JoinWaitingListWriteInput): Promise<JoinWaitingListResult> {
  const id = newId()
  const entry = auditEntry({
    actorId: input.userId,
    action: 'waiting-list.joined',
    target: `performance:${input.performanceId}`,
    detail: { entryId: id, partySize: input.partySize },
  })

  const [inserted] = await db.batch([
    db.all<{ id: string }>(joinEntryStatement(id, input.performanceId, input.userId, input.partySize)),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE EXISTS (SELECT 1 FROM waiting_list WHERE id = ${id})
    `),
  ])

  return inserted.length > 0 ? { id, joined: true } : { id, joined: false }
}

export interface NextEntryRow {
  id: string
  userId: string
  partySize: number
  createdAt: number
}

// Oldest first (criterion 2's "join order"), bound by `cap` rather than by how many rows are
// actually `WAITING` (0006).
export function nextWaitingEntriesQuery(performanceId: string, cap: number): SQL {
  return sql`
    SELECT id, user_id AS userId, party_size AS partySize, created_at AS createdAt
    FROM waiting_list
    WHERE performance_id = ${performanceId} AND status = 'WAITING'
    ORDER BY created_at
    LIMIT ${cap}
  `
}

// The move from `WAITING` to `OFFERED` is a status change (0049's shape): the predicate rides the
// write, and a losing race (a concurrent sweep, or a manual desk offer) claims nothing.
export function offerEntryStatement(entryId: string, offeredAt: number, expiresAt: number): SQL {
  return sql`
    UPDATE waiting_list SET status = 'OFFERED', offered_at = ${offeredAt}, offer_expires_at = ${expiresAt}, updated_at = unixepoch()
    WHERE id = ${entryId} AND status = 'WAITING'
    RETURNING id
  `
}

export interface OfferedWaitingListEntry {
  id: string
  userId: string
  showTitle: string
  startsAt: number
  expiresAt: number
}

export interface OfferWaitingListRun {
  eligible: number
  // What just went out, for the caller to notify: minting a token and sending a message both
  // need a live Nitro runtime, so neither happens in this file (`server/utils/waiting-list-notify.ts`
  // does it instead, the same split `qrTokenFor` and `writeReservation` already keep, D-104).
  offered: OfferedWaitingListEntry[]
}

// Criterion 2: walks the queue strictly in join order and stops the moment the next entry's party
// does not fit, rather than skipping ahead to a smaller one further down (interpretation, D-113).
export async function offerWaitingList(event: H3Event | undefined, performanceId: string, at: Date, cap: number): Promise<OfferWaitingListRun> {
  const performance = await performanceById(performanceId)
  if (!performance) return { eligible: 0, offered: [] }

  const capacity = effectiveCapacity(performance)
  const [row] = await db.all<{ held: number }>(heldSeatsQuery(performanceId))
  let remaining = capacity === null ? Number.POSITIVE_INFINITY : capacity - Number(row?.held ?? 0)
  if (remaining <= 0) return { eligible: 0, offered: [] }

  const windowMinutes = await configValue(event, 'WAITING_LIST_OFFER_WINDOW_MINUTES')
  const now = Math.floor(at.getTime() / 1000)
  const candidates = await db.all<NextEntryRow>(nextWaitingEntriesQuery(performanceId, cap))

  const offered: OfferedWaitingListEntry[] = []
  for (const candidate of candidates) {
    if (candidate.partySize > remaining) break

    const expiresAt = offerExpiresAt(now, windowMinutes, performance.startsAt)
    if (offerWouldBeBornExpired(expiresAt, now)) continue

    const claimed = await db.all<{ id: string }>(offerEntryStatement(candidate.id, now, expiresAt))
    if (claimed.length === 0) continue

    remaining -= candidate.partySize
    offered.push({ id: candidate.id, userId: candidate.userId, showTitle: performance.showTitle, startsAt: performance.startsAt, expiresAt })
  }

  return { eligible: candidates.length, offered }
}

export interface ExpiredOfferRow {
  id: string
  performanceId: string
}

export function expiredOffersQuery(at: number, cap: number): SQL {
  return sql`
    SELECT id, performance_id AS performanceId FROM waiting_list
    WHERE status = 'OFFERED' AND offer_expires_at IS NOT NULL AND offer_expires_at <= ${at}
    ORDER BY offer_expires_at
    LIMIT ${cap}
  `
}

export function lapseOfferStatement(entryId: string): SQL {
  return sql`
    UPDATE waiting_list SET status = 'LAPSED', updated_at = unixepoch()
    WHERE id = ${entryId} AND status = 'OFFERED'
    RETURNING id
  `
}

export interface LapseOffersRun {
  eligible: number
  lapsed: number
  // Distinct performances a lapse touched, so the caller can re-offer the seat it just gave back
  // (criterion 3: "the next entry is offered").
  performanceIds: string[]
}

// `auditedWrite` is 0049's shape, the same one `releaseExpiredHolds` uses for the identical
// unpaid-hold sweep: a row already moved by something else writes no trail for a lapse that
// did not happen.
export async function lapseExpiredOffers(at: Date, cap: number): Promise<LapseOffersRun> {
  const now = Math.floor(at.getTime() / 1000)
  const candidates = await db.all<ExpiredOfferRow>(expiredOffersQuery(now, cap))

  let lapsed = 0
  const performanceIds = new Set<string>()
  for (const candidate of candidates) {
    const entry = auditEntry({ actorId: null, action: 'waiting-list.offer-lapsed', target: `waiting-list-entry:${candidate.id}` })
    const applied = await auditedWrite(db.all<{ id: string }>(lapseOfferStatement(candidate.id)), entry)
    if (applied) {
      lapsed += 1
      performanceIds.add(candidate.performanceId)
    }
  }

  return { eligible: candidates.length, lapsed, performanceIds: [...performanceIds] }
}

export interface WaitingListSummary {
  waiting: number
  offered: number
}

export function waitingListSummaryQuery(performanceId: string): SQL {
  return sql`
    SELECT
      (SELECT count(*) FROM waiting_list WHERE performance_id = ${performanceId} AND status = 'WAITING') AS waiting,
      (SELECT count(*) FROM waiting_list WHERE performance_id = ${performanceId} AND status = 'OFFERED') AS offered
  `
}

export async function waitingListSummary(performanceId: string): Promise<WaitingListSummary> {
  const [row] = await db.all<WaitingListSummary>(waitingListSummaryQuery(performanceId))
  return { waiting: Number(row?.waiting ?? 0), offered: Number(row?.offered ?? 0) }
}

export interface WaitingListEntryRow {
  id: string
  userId: string
  name: string
  email: string
  partySize: number
  status: WaitingListStatus
  createdAt: number
  offerExpiresAt: number | null
}

// The desk's own view (criterion 5): who is next, in the order they would be offered.
export function nextWaitingListEntriesForDeskQuery(performanceId: string, limit: number): SQL {
  return sql`
    SELECT w.id AS id, w.user_id AS userId, u.name AS name, u.email AS email, w.party_size AS partySize,
           w.status AS status, w.created_at AS createdAt, w.offer_expires_at AS offerExpiresAt
    FROM waiting_list w
    JOIN users u ON u.id = w.user_id
    WHERE w.performance_id = ${performanceId} AND w.status IN ('WAITING', 'OFFERED')
    ORDER BY w.created_at
    LIMIT ${limit}
  `
}

export async function nextWaitingListEntriesForDesk(performanceId: string, limit: number): Promise<WaitingListEntryRow[]> {
  return db.all<WaitingListEntryRow>(nextWaitingListEntriesForDeskQuery(performanceId, limit))
}

export interface WaitingListEntryForToken {
  id: string
  userId: string
  performanceId: string
  showId: string
  showTitle: string
  startsAt: number
  partySize: number
  status: WaitingListStatus
  offerExpiresAt: number | null
}

export function waitingListEntryQuery(id: string): SQL {
  return sql`
    SELECT w.id AS id, w.user_id AS userId, w.performance_id AS performanceId, p.show_id AS showId,
           s.title AS showTitle, p.starts_at AS startsAt, w.party_size AS partySize,
           w.status AS status, w.offer_expires_at AS offerExpiresAt
    FROM waiting_list w
    JOIN performances p ON p.id = w.performance_id
    JOIN shows s ON s.id = p.show_id
    WHERE w.id = ${id}
  `
}

export async function waitingListEntryById(id: string): Promise<WaitingListEntryForToken | undefined> {
  const [row] = await db.all<WaitingListEntryForToken>(waitingListEntryQuery(id))
  return row
}

// Criterion 4: "at any time", so a removal is accepted whatever the current status, except one
// already settled (claimed, already removed).
export function removeEntryStatement(entryId: string, at: number): SQL {
  return sql`
    UPDATE waiting_list SET status = 'REMOVED', removed_at = ${at}, updated_at = unixepoch()
    WHERE id = ${entryId} AND status IN ('WAITING', 'OFFERED')
    RETURNING id
  `
}

export async function removeWaitingListEntry(entryId: string, at: Date): Promise<boolean> {
  const entry = auditEntry({ actorId: null, action: 'waiting-list.removed', target: `waiting-list-entry:${entryId}` })
  return auditedWrite(db.all<{ id: string }>(removeEntryStatement(entryId, Math.floor(at.getTime() / 1000))), entry)
}

export interface ClaimWaitingListOfferResult {
  applied: boolean
  reservation?: WriteReservationResult
  refusal?: string
}

// The move from `OFFERED` to `CLAIMED`, 0049's shape again: whichever of two concurrent claims
// runs this statement first wins it, and the loser's `RETURNING` is empty (criterion 3).
export function claimEntryStatement(entryId: string, at: number): SQL {
  return sql`
    UPDATE waiting_list SET status = 'CLAIMED', updated_at = unixepoch()
    WHERE id = ${entryId} AND status = 'OFFERED' AND offer_expires_at > ${at}
    RETURNING id
  `
}

// Criterion 2 and 3: the claim, race-safe. `claimEntryStatement` is the arbiter of "claimed
// twice": only one concurrent claim can win it, and everything after runs at most once.
// Always called from a route, never a task, so the event is real (`hasCurrentMembership` needs one).
export async function claimWaitingListOffer(event: H3Event, entry: WaitingListEntryForToken, input: ClaimWaitingListOfferInput): Promise<ClaimWaitingListOfferResult> {
  const now = new Date()
  const nowSeconds = Math.floor(now.getTime() / 1000)

  if (entry.status !== 'OFFERED' || entry.offerExpiresAt === null || entry.offerExpiresAt <= nowSeconds) {
    return { applied: false, refusal: 'This offer is no longer open. Contact the box office if you still want to attend.' }
  }

  const mismatch = partySizeMismatchReason(totalTickets(input.lines), entry.partySize)
  if (mismatch) return { applied: false, refusal: mismatch }

  const claimed = await db.all<{ id: string }>(claimEntryStatement(entry.id, nowSeconds))
  if (claimed.length === 0) {
    return { applied: false, refusal: 'This offer is no longer open. Contact the box office if you still want to attend.' }
  }

  const performance = await performanceById(entry.performanceId)
  if (!performance) return { applied: false, refusal: 'This performance no longer exists' }

  const refusal = saleRefusal(performance, now, 'CUSTOMER')
  const releaseMinutes = resolveHoldReleaseMinutes(performance.holdReleaseMinutesBefore, await configValue(event, 'HOLD_RELEASE_MINUTES_BEFORE'))
  const expiresAt = holdExpiresAt(performance.startsAt, releaseMinutes)
  const born = bornExpiredReason(expiresAt, nowSeconds)

  if (refusal || born) {
    await db.run(sql`UPDATE waiting_list SET status = 'OFFERED', updated_at = unixepoch() WHERE id = ${entry.id} AND status = 'CLAIMED'`)
    return { applied: false, refusal: refusal?.says ?? born ?? 'This performance can no longer take this booking' }
  }

  const isMember = await hasCurrentMembership(event, entry.userId, now)
  const resolved = new Map((await bookableTicketTypes(entry.performanceId, entry.showId, isMember, false)).map(type => [type.id, type]))
  const lines: ReservationLineToWrite[] = []
  for (const line of input.lines) {
    const type = resolved.get(line.ticketTypeId)
    if (!type) {
      await db.run(sql`UPDATE waiting_list SET status = 'OFFERED', updated_at = unixepoch() WHERE id = ${entry.id} AND status = 'CLAIMED'`)
      return { applied: false, refusal: 'No such ticket type for this performance' }
    }
    lines.push({ ticketTypeId: type.id, quantity: line.quantity, pricePaid: type.price, priceSource: type.source })
  }

  const capacity = effectiveCapacity(performance)
  const result = await writeReservation({
    performanceId: entry.performanceId,
    userId: entry.userId,
    source: 'WEB',
    windowBypassed: false,
    lines,
    capacity,
    holdExpiresAt: expiresAt,
  })

  if (result.tickets.length < result.requested) {
    // The seat went to somebody else between the offer and this claim: reopen it within what is
    // left of the original window rather than leaving the entry stuck `CLAIMED` with nothing.
    await db.run(sql`UPDATE waiting_list SET status = 'OFFERED', updated_at = unixepoch() WHERE id = ${entry.id} AND status = 'CLAIMED'`)
    return { applied: false, refusal: 'This performance no longer has room for that party. Contact the box office directly.' }
  }

  await db.run(sql`UPDATE waiting_list SET claimed_reservation_id = ${result.id}, updated_at = unixepoch() WHERE id = ${entry.id} AND status = 'CLAIMED'`)

  return { applied: true, reservation: result }
}

export interface PurgeWaitingListRun {
  eligiblePerformances: number
  purgedPerformances: number
  purgedEntries: number
}

export interface PurgeCandidateRow {
  performanceId: string
  startsAt: number
}

// The performances worth checking at all: past curtain, so a night-boundary computation in JS
// (this file has no other SQL-side way to know Europe/London, 0014) only ever runs on candidates.
export function purgeCandidatesQuery(before: number, cap: number): SQL {
  return sql`
    SELECT DISTINCT w.performance_id AS performanceId, p.starts_at AS startsAt
    FROM waiting_list w
    JOIN performances p ON p.id = w.performance_id
    WHERE p.starts_at <= ${before}
    LIMIT ${cap}
  `
}

// Criterion 4: purged once that performance's whole night has ended (0014), not merely after
// curtain, and scoped by performance rather than by entry: the bound parameter count follows how
// many nights just ended, never how many people joined a list (0006).
export async function purgeWaitingListForEndedNights(at: Date, cap: number): Promise<PurgeWaitingListRun> {
  const now = Math.floor(at.getTime() / 1000)
  const candidates = await db.all<PurgeCandidateRow>(purgeCandidatesQuery(now, cap))

  const ended = candidates.filter(row => showNightBounds(performanceNight(row.startsAt)).to.getTime() <= at.getTime())
  if (ended.length === 0) return { eligiblePerformances: candidates.length, purgedPerformances: 0, purgedEntries: 0 }

  const statements: BatchItem<'sqlite'>[] = ended.map(row => db.all<{ id: string }>(sql`DELETE FROM waiting_list WHERE performance_id = ${row.performanceId} RETURNING id`))
  const results = await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  const purgedEntries = results.reduce((total: number, rows) => total + rows.length, 0)

  return { eligiblePerformances: candidates.length, purgedPerformances: ended.length, purgedEntries }
}
