import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { newId } from './accounts'
import { auditedWrite } from './audit'
import { commitSale } from './sale'
import { openSessionFor, requireOpenSession } from './till'
import { qrTokenFor, verifyQrToken } from './qr-tokens'
import { ATTEMPT_COLUMNS, recordPostedSaleStatement, stuckAttemptsQuery } from './sumup-queries'
import { auditEntry } from '#shared/utils/audit'
import { londonDayOf } from '#shared/utils/ledger'
import { ATTEMPT_KEY_DOMAIN, OPEN_ATTEMPT_STATUSES, SUMUP_RETURN_PATH, SUMUP_STUCK_COMPLETING_MINUTES, UNRESOLVED_ATTEMPT_STATUSES, attemptMayMove, isTerminalAttempt, sumupLaunchUrl } from '#shared/utils/sumup'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { SaleInput, SaleReceipt } from '#shared/utils/sale'
import type { SumupAttemptStatus, SumupAttemptView, SumupResolution, SumupReturnInput } from '#shared/utils/sumup'

// One hand-off to the SumUp app (F-124, 0069): the row, its conditional transitions, and the
// completion that posts the sale through the same commit the typed flow uses.

// The key is a booking-token signature over a domain-separated id, so a reservation's token can
// never complete an attempt and nothing needs a second secret (D-108, D-124's own pattern).
export async function attemptKeyFor(id: string): Promise<string> {
  return qrTokenFor(ATTEMPT_KEY_DOMAIN + id)
}

export async function verifyAttemptKey(key: string): Promise<string | null> {
  const decoded = await verifyQrToken(key)
  return decoded?.startsWith(ATTEMPT_KEY_DOMAIN) ? decoded.slice(ATTEMPT_KEY_DOMAIN.length) : null
}

export interface SumupConfig { affiliateKey: string, appId: string }

export function sumupEnabled(config: SumupConfig | undefined): config is SumupConfig {
  return Boolean(config?.affiliateKey && config?.appId)
}

// What the completion replays: the basket exactly as submitted, and the scope the sale resolved
// under, so the write happens under the same session and houses the start did (criterion 2).
export interface AttemptBasket {
  sale: SaleInput
  sessionId: string
  venueId: string
  night: string
  performanceId: string | null
  performanceIds: string[]
}

interface AttemptRow {
  id: string
  tillSessionId: string
  venueId: string
  night: string
  createdBy: string
  createdByName: string | null
  createdAt: number
  basket: string
  expectedTotalPence: number
  status: SumupAttemptStatus
  smpStatus: string | null
  smpTxCode: string | null
  smpMessage: string | null
  smpFailureCause: string | null
  resolution: SumupResolution | null
  resolvedBy: string | null
  resolvedAt: number | null
  resolutionNote: string | null
  callbackAt: number | null
  entryId: string | null
  error: string | null
}

export function attemptByIdQuery(id: string): SQL {
  return sql`SELECT ${ATTEMPT_COLUMNS} FROM sumup_attempts a LEFT JOIN users u ON u.id = a.created_by WHERE a.id = ${id}`
}

// Bounded by the night, never by a list of ids (0003): a night's hand-offs are a few dozen at most.
export function unresolvedAttemptsQuery(night: string, venueId: string): SQL {
  return sql`
    SELECT ${ATTEMPT_COLUMNS} FROM sumup_attempts a LEFT JOIN users u ON u.id = a.created_by
    WHERE a.night = ${night} AND a.venue_id = ${venueId}
      AND a.status IN (${sql.join(UNRESOLVED_ATTEMPT_STATUSES.map(status => sql`${status}`), sql`, `)})
    ORDER BY a.created_at DESC
  `
}

export function view(row: AttemptRow): SumupAttemptView {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
    expectedTotalPence: row.expectedTotalPence,
    smpTxCode: row.smpTxCode,
    smpMessage: row.smpMessage,
    smpFailureCause: row.smpFailureCause,
    error: row.error,
    entryId: row.entryId,
    resolution: row.resolution,
  }
}

export async function attemptById(id: string): Promise<AttemptRow | undefined> {
  const [row] = await db.all<AttemptRow>(attemptByIdQuery(id))
  return row
}

export async function unresolvedAttempts(night: string, venueId: string): Promise<SumupAttemptView[]> {
  return (await db.all<AttemptRow>(unresolvedAttemptsQuery(night, venueId))).map(view)
}

export function basketOf(row: AttemptRow): AttemptBasket {
  return JSON.parse(row.basket) as AttemptBasket
}

// A booking inside an attempt still waiting cannot be charged again by hand or by a second
// hand-off (criterion 7). Scanned in memory over the night's open rows, never an IN list.
export async function refuseBookingsInOpenAttempts(night: string, reservationIds: string[]): Promise<void> {
  if (reservationIds.length === 0) return
  const rows = await db.all<{ basket: string }>(sql`
    SELECT basket FROM sumup_attempts
    WHERE night = ${night} AND status IN (${sql.join(OPEN_ATTEMPT_STATUSES.map(status => sql`${status}`), sql`, `)})
  `)
  for (const row of rows) {
    const basket = JSON.parse(row.basket) as AttemptBasket
    const held = basket.sale.tickets.map(ticket => ticket.reservationId)
    if (reservationIds.some(id => held.includes(id))) {
      throw createError({ statusCode: 409, statusMessage: 'That booking is waiting on a SumUp payment already. Resolve it first.' })
    }
  }
}

export interface StartAttemptInput {
  basket: AttemptBasket
  expectedTotalPence: number
  actorId: string
}

export async function startAttempt(input: StartAttemptInput): Promise<string> {
  const id = newId()
  const entry = auditEntry({
    actorId: input.actorId,
    action: 'bar.sumup.started',
    target: `sumup-attempt:${id}`,
    detail: { sessionId: input.basket.sessionId, expectedTotalPence: input.expectedTotalPence },
  })
  await auditedWrite(db.insert(schema.sumupAttempts).values({
    id,
    tillSessionId: input.basket.sessionId,
    venueId: input.basket.venueId,
    night: input.basket.night,
    createdBy: input.actorId,
    // A json-mode column: drizzle encodes it, so a string here would be encoded twice.
    basket: input.basket,
    expectedTotalPence: input.expectedTotalPence,
    status: 'STARTED',
  }), entry)
  return id
}

export function launchUrlFor(config: SumupConfig, baseURL: string, id: string, key: string, totalPence: number): string {
  return sumupLaunchUrl({
    affiliateKey: config.affiliateKey,
    appId: config.appId,
    totalPence,
    title: 'NNT bar',
    attemptId: id,
    returnUrl: `${baseURL}${SUMUP_RETURN_PATH}/${key}`,
  })
}

interface Move {
  smp?: SumupReturnInput
  resolution?: SumupResolution
  resolvedBy?: string | null
  note?: string | null
  entryId?: string | null
  error?: string | null
}

// Every transition is a conditional write with the predicate on the statement (0001, 0003): a
// callback and a staff answer racing each other advance the row once, and the loser reads back.
async function move(id: string, from: SumupAttemptStatus, to: SumupAttemptStatus, change: Move, actorId: string | null): Promise<boolean> {
  if (!attemptMayMove(from, to)) return false
  // A row whose sale is already posted is never claimed for recording again: the replay of a
  // mismatch would otherwise commit the basket a second time (criterion 5).
  const unposted = to === 'COMPLETING' ? sql`entry_id IS NULL` : sql`1 = 1`
  const now = Math.floor(Date.now() / 1000)
  const resolvedAt = isTerminalAttempt(to) || to === 'MISMATCH' ? now : null
  const entry = auditEntry({
    actorId,
    action: to === 'SUCCEEDED' ? 'bar.sumup.completed' : to === 'MISMATCH' ? 'bar.sumup.mismatched' : to === 'COMPLETING' ? 'bar.sumup.claimed' : 'bar.sumup.resolved',
    target: `sumup-attempt:${id}`,
    detail: { from, to, resolution: change.resolution ?? null, smpTxCode: change.smp?.smpTxCode ?? null },
  })
  // RETURNING, so the batch answers with rows and `auditedWrite` can read whether it applied.
  return auditedWrite(db.all(sql`
    UPDATE sumup_attempts SET
      status = ${to},
      smp_status = coalesce(${change.smp?.smpStatus ?? null}, smp_status),
      smp_tx_code = coalesce(${change.smp?.smpTxCode ?? null}, smp_tx_code),
      smp_message = coalesce(${change.smp?.smpMessage ?? null}, smp_message),
      smp_failure_cause = coalesce(${change.smp?.smpFailureCause ?? null}, smp_failure_cause),
      callback_at = CASE WHEN ${change.smp ? 1 : 0} = 1 THEN ${now} ELSE callback_at END,
      resolution = coalesce(${change.resolution ?? null}, resolution),
      resolved_by = coalesce(${change.resolvedBy ?? null}, resolved_by),
      resolved_at = coalesce(${resolvedAt}, resolved_at),
      resolution_note = coalesce(${change.note ?? null}, resolution_note),
      entry_id = coalesce(${change.entryId ?? null}, entry_id),
      error = ${change.error ?? null}
    WHERE id = ${id} AND status = ${from} AND ${unposted}
    RETURNING id
  `), entry)
}

// Not a transition the state machine offers a caller: this is the commit's own bookkeeping, and
// it lands on SUCCEEDED from wherever the row drifted to while the sale was being written.
async function recordPostedSale(id: string, entryId: string | null, actorId: string | null): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await auditedWrite(db.all(recordPostedSaleStatement(id, entryId, now)), auditEntry({
    actorId,
    action: 'bar.sumup.completed',
    target: `sumup-attempt:${id}`,
    detail: { to: 'SUCCEEDED', entryId },
  }))
}

export interface CompletionOutcome {
  status: SumupAttemptStatus
  receipt: SaleReceipt | null
  error: string | null
}

export interface CompletionActor {
  actorId: string | null
  resolution: SumupResolution
  baseURL: string
  event?: H3Event
}

// The answer to a hand-off (criteria 3, 4, 5). Idempotent on a row already past STARTED: a second
// delivery of the same callback reads the state it finds and posts nothing twice.
export async function completeAttempt(row: AttemptRow, smp: SumupReturnInput, by: CompletionActor): Promise<CompletionOutcome> {
  if (row.status !== 'STARTED' && row.status !== 'MISMATCH') {
    return { status: row.status, receipt: null, error: row.error }
  }

  if (smp.smpStatus !== 'success') {
    const moved = await move(row.id, 'STARTED', 'FAILED', { smp, resolution: by.resolution, resolvedBy: by.actorId }, by.actorId)
    const after = moved ? 'FAILED' : (await attemptById(row.id))?.status ?? row.status
    return { status: after, receipt: null, error: null }
  }

  // Claim first, so two answers cannot both post (0003); the sale itself follows the claim.
  const claimed = await move(row.id, row.status, 'COMPLETING', { smp, resolution: by.resolution, resolvedBy: by.actorId }, by.actorId)
  if (!claimed) {
    const after = await attemptById(row.id)
    return { status: after?.status ?? row.status, receipt: null, error: after?.error ?? null }
  }

  const basket = basketOf(row)
  try {
    const session = requireOpenSession(await openSessionFor(basket.venueId, basket.night))
    const receipt = await commitSale(
      basket.sale.lines, londonDayOf(new Date()), basket.sale.expectedTotalPence, basket.sale.ageCheck, basket.sale.discountId, null,
      {
        actorId: row.createdBy,
        sessionId: session.id,
        venueId: basket.venueId,
        night: basket.night,
        performanceId: basket.performanceId,
        performanceIds: basket.performanceIds,
        baseURL: by.baseURL,
        event: by.event,
      },
      { tickets: basket.sale.tickets, walkUps: basket.sale.walkUps, walkUpGuest: basket.sale.walkUpGuest },
    )
    await recordPostedSale(row.id, receipt.entryId, by.actorId)
    return { status: 'SUCCEEDED', receipt, error: null }
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    // A refusal is a fact about the basket: the reader has the money and the ledger does not,
    // which is for a person to resolve (criterion 4). Anything else is retried by a later answer.
    if (statusCode !== undefined && statusCode < 500) {
      const message = (error as { statusMessage?: string }).statusMessage ?? 'The sale could not be recorded'
      await move(row.id, 'COMPLETING', 'MISMATCH', { error: message, resolvedBy: by.actorId }, by.actorId)
      return { status: 'MISMATCH', receipt: null, error: message }
    }
    await move(row.id, 'COMPLETING', 'STARTED', {}, by.actorId)
    throw error
  }
}

// Staff answering for an attempt the app never answered for (criterion 5): "it went through" is a
// success replayed through the same path; "it did not" abandons it, with a note when a mismatch.
export async function resolveAttempt(row: AttemptRow, outcome: 'succeeded' | 'abandoned', smpTxCode: string | null, note: string | null, by: CompletionActor): Promise<CompletionOutcome> {
  if (outcome === 'succeeded') {
    if (row.status === 'COMPLETING' && stuckFor(row) >= SUMUP_STUCK_COMPLETING_MINUTES) {
      await move(row.id, 'COMPLETING', 'STARTED', {}, by.actorId)
      const fresh = await attemptById(row.id)
      if (fresh) row = fresh
    }
    return completeAttempt(row, { smpStatus: 'success', smpTxCode, smpMessage: null, smpFailureCause: null, foreignTxId: null }, by)
  }

  if (row.status === 'MISMATCH' && !note) {
    throw createError({ statusCode: 400, statusMessage: 'The reader took this money: say what happened to it before abandoning the record' })
  }
  const from: SumupAttemptStatus = row.status === 'COMPLETING' && stuckFor(row) >= SUMUP_STUCK_COMPLETING_MINUTES ? 'COMPLETING' : row.status
  if (from === 'COMPLETING') await move(row.id, 'COMPLETING', 'STARTED', {}, by.actorId)
  const moved = await move(row.id, from === 'COMPLETING' ? 'STARTED' : from, 'ABANDONED', { resolution: 'STAFF', resolvedBy: by.actorId, note }, by.actorId)
  if (!moved) throw createError({ statusCode: 409, statusMessage: `That attempt is ${row.status.toLowerCase()} and cannot be abandoned now` })
  return { status: 'ABANDONED', receipt: null, error: null }
}

// Minutes since the answer that began the recording, for a completion that never finished.
function stuckFor(row: AttemptRow): number {
  const since = row.callbackAt ?? row.createdAt
  return (Date.now() / 1000 - since) / 60
}

// The sweep (criterion 5): an unanswered hand-off is abandoned after the configured window, and a
// completion stuck past its own is a mismatch for a person to look at.
export async function sweepAttempts(timeoutMinutes: number, now = new Date()): Promise<{ abandoned: number, mismatched: number }> {
  const at = Math.floor(now.getTime() / 1000)
  const stale = await db.all<AttemptRow>(stuckAttemptsQuery(at, timeoutMinutes))
  let abandoned = 0
  let mismatched = 0
  for (const row of stale) {
    if (row.status === 'STARTED') {
      if (await move(row.id, 'STARTED', 'ABANDONED', { resolution: 'SWEEP', error: 'No answer from the SumUp app in time' }, null)) abandoned++
    }
    else if (await move(row.id, 'COMPLETING', 'MISMATCH', { resolution: 'SWEEP', error: 'Recording the sale was interrupted; check the reader before retrying' }, null)) {
      mismatched++
    }
  }
  return { abandoned, mismatched }
}

export async function openAttemptCount(night: string, venueId: string): Promise<number> {
  const [row] = await db.all<{ n: number }>(sql`
    SELECT count(*) AS n FROM sumup_attempts
    WHERE night = ${night} AND venue_id = ${venueId}
      AND status IN (${sql.join(OPEN_ATTEMPT_STATUSES.map(status => sql`${status}`), sql`, `)})
  `)
  return Number(row?.n ?? 0)
}
