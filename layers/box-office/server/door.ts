// The door (Box office specification, part 3, "A ticket", and part 4, "The door"; BO-40). A scanned
// code is checked for its signature, hashed, and the ticket found by the hash. Admission is one
// conditional update that stamps the ticket with the scan's id, so a ticket is admitted exactly
// once however many devices scan it together, and the scan row written next in the same batch takes
// its result from that stamp: admitted if the stamp is its own id, already admitted otherwise. A desk code or a
// booking reference admits nobody and writes no scan row; one for another performance says which.
//
// A ticket sold on a requirement, such as a member's price, is checked again before it is admitted
// (part 5, "Checking again at entry"): when its type rechecks, and always when it was met by a typed
// reference. Not met turns the person away to the desk; a source that is off, failing or that this
// steward may not ask admits them and marks the scan unchecked, so a source being down never holds
// the queue.
import { all, can, createUnit, first, newId, nowMs, refuse, requirements, useContext } from '#kit'
import { signing } from '#kit/signing'
import { accountLabel, getTerm } from '#modules/core'
import { hashOf } from './codes'
import { doorCodeKind } from './door-codes'
import { DOOR_CODE_PURPOSE, signedPart, TICKET_KIND } from './tickets'

export type ScanResult = 'admitted' | 'already_admitted' | 'void' | 'wrong_performance' | 'requirement_not_met' | 'unknown' | 'bad_signature' | 'not_paid' | 'card' | 'card_not_allowed' | 'reference'

export interface ScanOutcome {
  result: ScanResult
  /** Null when no row is written: a desk code or a reference. */
  scanId: string | null
  ticketId?: string
  /** Already in: when, and at which door. */
  admittedAt?: number
  admittedAtDoor?: string | null
  /** Void: why. */
  voidReason?: string
  /** Wrong performance: the one the ticket is for. */
  ticketPerformanceId?: string
  /** Wrong performance: what the steward tells the customer, the show and when it starts. */
  ticketPerformance?: { id: string, title: string, label: string | null, startsAt: number, venue: string }
  /** A code of another kind (box-office.door-code), such as a membership card: what it says. */
  card?: { kind: string, headline: string, line: string, state: 'ok' | 'attention' }
  /** Admitted or already in: the ticket and how much of its booking is in now. */
  booking?: { reference: string, buyer: string | null, ticketType: string, admitted: number, tickets: number }
  /** A paid booking's reference for this performance: the door finds it in the list, where it can admit them. */
  reference?: string
  /** Not paid: the reservation the door sends to the box office or the bar, and what is owed. */
  reservation?: { reference: string, buyer: string | null, tickets: number, amountDueMinor: number, currency: string }
  /** Requirement not met: the source's words, such as "Membership not current", and the ticket's type. */
  requirement?: { reason: string | null, ticketType: string }
  /** Admitted without its requirement being checked again: the source was off, failing or not open to this steward. */
  unchecked?: boolean
  /**
   * Requirement not met: whether this steward may "Admit anyway" (R-30). Only for a holder of
   * box-office.ticket-type.override-requirement, and never on their own order.
   */
  overridable?: boolean
}

/** The vocabulary a steward picks the reason from when admitting anyway. */
export const OVERRIDE_REASONS = 'box-office.override-reason'
const OVERRIDE = 'box-office.ticket-type.override-requirement'

/** Whether the actor may admit this ticket anyway: they hold the override, and it is not on their own order. */
async function mayOverride(ticketId: string, performanceId: string): Promise<boolean> {
  const actor = useContext().actor
  if (!(await can(actor, OVERRIDE as never, ['core.performance', performanceId])).allowed) return false
  const order = await first<{ account_id: string | null }>('SELECT o.account_id FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id JOIN box_office_orders o ON o.id = l.order_id WHERE t.id = ?', ticketId)
  return !!order && (!actor.accountId || order.account_id !== actor.accountId)
}

// Sources checked once, when the ticket is sold, and never at the door, whatever the ticket type's
// recheck setting: the access scheme is guarded by an ability a steward does not hold (part 5,
// "What Box office names from the scheme").
const SOLD_ONCE = ['core.access-scheme:']

interface Kept { ref: string | null, account: string | null, evidence: string | null, recheck: number, type_name: string }

/** Checks a ticket's requirement again at the door: met, not met (with the source's words), or unchecked. */
async function recheck(ticketId: string, performanceId: string): Promise<{ verdict: 'met' | 'unchecked' } | { verdict: 'not-met', reason: string | null, ticketType: string }> {
  const kept = await first<Kept>(
    `SELECT t.requirement_ref AS ref, t.requirement_account_id AS account, t.requirement_evidence_id AS evidence, y.recheck_at_entry AS recheck, y.name AS type_name
      FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id JOIN box_office_ticket_types y ON y.id = l.ticket_type_id WHERE t.id = ?`, ticketId)
  if (!kept?.ref || SOLD_ONCE.some(prefix => kept.ref!.startsWith(prefix))) return { verdict: 'met' }
  // A typed reference is always checked again; a ticket met by the buyer's account only when its type says so.
  if (!kept.evidence && !kept.recheck) return { verdict: 'met' }
  const [answer] = kept.evidence
    ? await requirements.check({ accounts: [null], refs: [kept.ref], presented: [{ ref: kept.ref, evidence: kept.evidence }], record: ['core.performance', performanceId], whenUnavailable: 'met' })
    : await requirements.check({ accounts: [kept.account], refs: [kept.ref], record: ['core.performance', performanceId], whenUnavailable: 'met' })
  if (!answer || answer.unavailable || answer.notAllowed) return { verdict: 'unchecked' }
  if (answer.verdict === 'met') return { verdict: 'met' }
  return { verdict: 'not-met', reason: answer.summary ?? answer.reason ?? null, ticketType: kept.type_name }
}

/** The booking a ticket belongs to, at this performance: its reference, the ticket's type, and how many are in. */
async function bookingOf(ticketId: string, performanceId: string): Promise<ScanOutcome['booking']> {
  const row = await first<{ reference: string, type_name: string, order_id: string, account_id: string | null }>(
    `SELECT o.reference, y.name AS type_name, o.id AS order_id, o.account_id FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id
      JOIN box_office_orders o ON o.id = l.order_id JOIN box_office_ticket_types y ON y.id = l.ticket_type_id WHERE t.id = ?`, ticketId)
  if (!row) return undefined
  const counts = await first<{ tickets: number, admitted: number }>(
    `SELECT count(*) AS tickets, sum(CASE WHEN t.admitted_at IS NOT NULL THEN 1 ELSE 0 END) AS admitted FROM box_office_tickets t
      JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ? AND t.performance_id = ? AND t.state = 'valid'`, row.order_id, performanceId)
  return { reference: row.reference, buyer: row.account_id ? await accountLabel(row.account_id) : null, ticketType: row.type_name, admitted: Number(counts?.admitted ?? 0), tickets: Number(counts?.tickets ?? 0) }
}

/** The performance a ticket or booking is for, as the door names it to the customer. */
async function performanceOf(performanceId: string): Promise<ScanOutcome['ticketPerformance']> {
  const row = await first<{ id: string, title: string, label: string | null, starts_at: number, venue: string }>(
    `SELECT f.id, p.title, f.label, f.starts_at, v.name AS venue FROM core_performances f JOIN core_productions p ON p.id = f.production_id
      JOIN core_venues v ON v.id = f.venue_id WHERE f.id = ?`, performanceId)
  return row ? { id: row.id, title: row.title, label: row.label, startsAt: row.starts_at, venue: row.venue } : undefined
}

/** Another performance's ticket or booking: which one it is for, so the steward can say. */
async function elsewhere(performanceId: string): Promise<Pick<ScanOutcome, 'ticketPerformanceId' | 'ticketPerformance'>> {
  const ticketPerformance = await performanceOf(performanceId)
  return { ticketPerformanceId: performanceId, ...ticketPerformance ? { ticketPerformance } : {} }
}

/**
 * A scan made on a device that was offline (D2, box office review) carries the id the device gave it
 * and the device's time; it was admitted there already, after the device checked the code's
 * signature against its copy of the door list. The server admits it at that time and marks it
 * offline. A requirement it cannot confirm now is marked unchecked rather than turned away, since
 * the person is already in.
 */
export interface OfflineScan { id: string, scannedAt: number }

export interface ScanInput { performanceId: string, code: string, deviceLabel?: string | null, offline?: OfflineScan }

/** The device's time for an offline scan, never later than the server's. */
const deviceTime = (offline: OfflineScan | undefined, now: number) => offline ? Math.min(offline.scannedAt, now) : now

interface TicketRow { id: string, performance_id: string, state: 'valid' | 'void', void_reason: string | null, admitted_at: number | null }

const PARTS = 4 // not-policy: kind, key id, code and signature

/** Scans one code at the door of a performance, in a unit of its own, and says what happened. */
export async function scan(input: ScanInput): Promise<ScanOutcome> {
  const code = input.code.trim()
  const parts = code.split('.')
  const received = nowMs()
  const at = deviceTime(input.offline, received)
  const offline = input.offline ? 1 : 0
  const actor = useContext().actor.accountId ?? null
  const unit = createUnit()
  const scanId = input.offline?.id ?? newId('scan')
  const row = (result: string, ticketId: string | null) => unit.view().add({
    sql: 'INSERT INTO box_office_scans (id, ticket_id, performance_id, result, unchecked, scanned_by, device_label, scanned_at, received_at, offline) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)',
    params: [scanId, ticketId, input.performanceId, result, actor, input.deviceLabel ?? null, at, received, offline],
  })
  const recorded = async (outcome: Omit<ScanOutcome, 'scanId'>, ticketId: string | null = null): Promise<ScanOutcome> => {
    row(outcome.result, ticketId)
    await unit.commit()
    return { ...outcome, scanId }
  }

  // A code of another kind, such as a membership card, shows what its module says and admits nobody.
  // Like a desk code, it writes no scan row.
  const other = parts.length === PARTS ? await doorCodeKind(parts[0]!) : null
  if (other) {
    const [kind, keyId, random, signature] = parts as [string, string, string, string]
    if (!await signing.verify(DOOR_CODE_PURPOSE, keyId, signedPart(kind, keyId, random), signature)) return { result: 'bad_signature', scanId: null }
    if (!(await can(useContext().actor, other.ability as never)).allowed) return { result: 'card_not_allowed', scanId: null }
    const said = await other.resolve(random)
    return said ? { result: 'card', scanId: null, card: { kind, ...said } } : { result: 'unknown', scanId: null }
  }
  if (parts.length !== PARTS || parts[0] !== TICKET_KIND) {
    // What a reservation's message carries is not a ticket: the desk takes the payment first. A paid
    // booking's reference is ours too: for another night it says which, and for tonight the door
    // finds the booking in its list, where its tickets can be admitted.
    const order = await first<{ id: string, reference: string, state: string, total_minor: number, currency: string, account_id: string | null }>("SELECT id, reference, state, total_minor, currency, account_id FROM box_office_orders WHERE state IN ('reserved', 'awaiting_payment', 'confirmed') AND (desk_code_hash = ? OR reference = ?)", await hashOf(code.toUpperCase()), code.toUpperCase())
    if (order) {
      const lines = await all<{ performance_id: string }>("SELECT performance_id FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' AND state = 'live' ORDER BY performance_id", order.id)
      // A booking for another night is that, whether paid or not.
      if (lines.length && !lines.some(l => l.performance_id === input.performanceId)) return { result: 'wrong_performance', scanId: null, ...await elsewhere(lines[0]!.performance_id) }
      if (order.state === 'confirmed') return lines.length ? { result: 'reference', scanId: null, reference: order.reference } : recorded({ result: 'unknown' })
      return { result: 'not_paid', scanId: null, reservation: { reference: order.reference, buyer: order.account_id ? await accountLabel(order.account_id) : null, tickets: lines.filter(l => l.performance_id === input.performanceId).length, amountDueMinor: order.total_minor, currency: order.currency } }
    }
    return recorded({ result: 'unknown' })
  }
  const [kind, keyId, random, signature] = parts as [string, string, string, string]
  if (!await signing.verify(DOOR_CODE_PURPOSE, keyId, signedPart(kind, keyId, random), signature)) return recorded({ result: 'bad_signature' })

  const ticket = await first<TicketRow>('SELECT id, performance_id, state, void_reason, admitted_at FROM box_office_tickets WHERE code_hash = ?', await hashOf(random))
  if (!ticket) return recorded({ result: 'unknown' })
  if (ticket.state === 'void') return recorded({ result: 'void', ticketId: ticket.id, voidReason: ticket.void_reason ?? undefined }, ticket.id)
  if (ticket.performance_id !== input.performanceId) return recorded({ result: 'wrong_performance', ticketId: ticket.id, ...await elsewhere(ticket.performance_id) }, ticket.id)
  // A ticket already in is said so without asking again; one not yet in is checked before it is admitted.
  const checked = ticket.admitted_at === null ? await recheck(ticket.id, input.performanceId) : { verdict: 'met' as const }
  if (checked.verdict === 'not-met' && !input.offline) {
    const overridable = await mayOverride(ticket.id, input.performanceId)
    return recorded({ result: 'requirement_not_met', ticketId: ticket.id, requirement: { reason: checked.reason, ticketType: checked.ticketType }, ...overridable ? { overridable } : {} }, ticket.id)
  }
  const unchecked = checked.verdict === 'met' ? 0 : 1

  // One conditional update admits and stamps; the scan row reads the stamp to say whether it was the one.
  unit.view().add({ sql: "UPDATE box_office_tickets SET admitted_at = ?, admitted_scan_id = ?, updated_at = ? WHERE id = ? AND state = 'valid' AND admitted_at IS NULL AND performance_id = ?", params: [at, scanId, received, ticket.id, input.performanceId] })
  unit.view().add({
    sql: `INSERT INTO box_office_scans (id, ticket_id, performance_id, result, unchecked, scanned_by, device_label, scanned_at, received_at, offline)
      SELECT ?1, t.id, ?2, CASE WHEN t.admitted_scan_id = ?1 THEN 'admitted' ELSE 'already_admitted' END, CASE WHEN t.admitted_scan_id = ?1 THEN ?7 ELSE 0 END, ?3, ?4, ?5, ?8, ?9 FROM box_office_tickets t WHERE t.id = ?6`, // not-policy: numbered parameters
    params: [scanId, input.performanceId, actor, input.deviceLabel ?? null, at, ticket.id, unchecked, received, offline],
  })
  await unit.commit()
  const written = await first<{ result: 'admitted' | 'already_admitted' }>('SELECT result FROM box_office_scans WHERE id = ?', scanId)
  const booking = await bookingOf(ticket.id, input.performanceId)
  if (written?.result === 'admitted') return { result: 'admitted', scanId, ticketId: ticket.id, booking, ...unchecked ? { unchecked: true } : {} }
  const earlier = await first<{ scanned_at: number, device_label: string | null }>('SELECT s.scanned_at, s.device_label FROM box_office_tickets t JOIN box_office_scans s ON s.id = t.admitted_scan_id WHERE t.id = ?', ticket.id)
  return { result: 'already_admitted', scanId, ticketId: ticket.id, admittedAt: earlier?.scanned_at, admittedAtDoor: earlier?.device_label ?? null, booking }
}

export interface AdmitAnywayInput { performanceId: string, ticketId: string, reasonTermId: string, deviceLabel?: string | null }

/**
 * "Admit anyway" (R-30): admits a ticket whose requirement was not met at the entry recheck, by a
 * holder of the override, with a reason from the theatre's list, audited. Refused on the steward's
 * own order, and for a ticket that does not need it: one already in, void, for another night, or one
 * whose requirement is met (or cannot be asked) now, which a plain scan admits.
 */
export async function admitAnyway(input: AdmitAnywayInput): Promise<ScanOutcome> {
  const ticket = await first<TicketRow>('SELECT id, performance_id, state, void_reason, admitted_at FROM box_office_tickets WHERE id = ?', input.ticketId)
  if (!ticket || ticket.performance_id !== input.performanceId) refuse('box-office.door.no-such-ticket', 'There is no such ticket for this performance.', { status: 404 })
  if (ticket.state === 'void') refuse('box-office.door.override-void', 'This ticket is void, so it cannot be admitted.', { status: 409 })
  if (ticket.admitted_at !== null) refuse('box-office.door.override-in', 'This ticket is already in.', { status: 409 })
  if (!await mayOverride(ticket.id, input.performanceId))
    refuse('box-office.door.override-own', 'You cannot admit a ticket on your own booking anyway.', { status: 403, remedy: 'Ask someone else on the door, or send them to the desk.' })
  const term = await getTerm(input.reasonTermId)
  if (!term || term.vocabularyKey !== OVERRIDE_REASONS || term.retired)
    refuse('box-office.door.override-bad-reason', 'That reason is not on the list of reasons for admitting anyway.', { status: 422, fields: { reasonTermId: 'invalid' }, remedy: 'Choose a reason from the list.' })
  const checked = await recheck(ticket.id, input.performanceId)
  if (checked.verdict !== 'not-met') refuse('box-office.door.override-not-needed', 'This ticket no longer needs admitting anyway.', { status: 409, remedy: 'Scan it again.' })

  const at = nowMs()
  const actor = useContext().actor.accountId ?? null
  const scanId = newId('scan')
  const unit = createUnit()
  unit.view().add({ sql: "UPDATE box_office_tickets SET admitted_at = ?, admitted_scan_id = ?, updated_at = ? WHERE id = ? AND state = 'valid' AND admitted_at IS NULL AND performance_id = ?", params: [at, scanId, at, ticket.id, input.performanceId] })
  unit.view().add({
    sql: `INSERT INTO box_office_scans (id, ticket_id, performance_id, result, reason_term_id, unchecked, scanned_by, device_label, scanned_at, received_at, offline)
      SELECT ?1, t.id, ?2, CASE WHEN t.admitted_scan_id = ?1 THEN 'admitted_by_override' ELSE 'already_admitted' END, CASE WHEN t.admitted_scan_id = ?1 THEN ?7 END, 0, ?3, ?4, ?5, ?5, 0 FROM box_office_tickets t WHERE t.id = ?6`, // not-policy: numbered parameters
    params: [scanId, input.performanceId, actor, input.deviceLabel ?? null, at, ticket.id, term.id],
  })
  unit.view().audit({ action: 'state', ability: OVERRIDE, record: ['core.performance', input.performanceId], detail: { ticketId: ticket.id, scanId, reasonTermId: term.id } })
  await unit.commit()
  const written = await first<{ result: string }>('SELECT result FROM box_office_scans WHERE id = ?', scanId)
  const booking = await bookingOf(ticket.id, input.performanceId)
  if (written?.result !== 'admitted_by_override') return { result: 'already_admitted', scanId, ticketId: ticket.id, booking }
  return { result: 'admitted', scanId, ticketId: ticket.id, booking }
}

/** `offline`: admitted on a device that was offline, with an id for each ticket it let in and the device's time. */
export interface AdmitByNameInput { performanceId: string, orderId: string, count: number, deviceLabel?: string | null, offline?: { ids: string[], scannedAt: number } }

/**
 * Admits tickets of one order from the door list, for a buyer with no phone and no printout (part 6,
 * "The door", find by name). Up to `count` of the order's valid tickets for this performance not
 * yet in are admitted, each with its own scan row, by the same conditional stamp as a scan, so a
 * ticket scanned on another device at the same moment is admitted once. Says how many went in.
 */
export async function admitByName(input: AdmitByNameInput): Promise<{ admitted: number, scanIds: string[] }> {
  const waiting = await all<{ id: string }>(
    `SELECT k.id FROM box_office_tickets k JOIN box_office_order_lines l ON l.id = k.order_line_id
      WHERE l.order_id = ? AND k.performance_id = ? AND k.state = 'valid' AND k.admitted_at IS NULL ORDER BY k.id LIMIT ?`,
    input.orderId, input.performanceId, input.count,
  )
  if (!waiting.length) return { admitted: 0, scanIds: [] }
  const received = nowMs()
  const at = input.offline ? Math.min(input.offline.scannedAt, received) : received
  const offline = input.offline ? 1 : 0
  const actor = useContext().actor.accountId ?? null
  const unit = createUnit()
  const scanIds: string[] = []
  for (const [n, ticket] of waiting.entries()) {
    const scanId = input.offline?.ids[n] ?? newId('scan')
    scanIds.push(scanId)
    unit.view().add({ sql: "UPDATE box_office_tickets SET admitted_at = ?, admitted_scan_id = ?, updated_at = ? WHERE id = ? AND state = 'valid' AND admitted_at IS NULL AND performance_id = ?", params: [at, scanId, received, ticket.id, input.performanceId] })
    unit.view().add({
      sql: `INSERT INTO box_office_scans (id, ticket_id, performance_id, result, unchecked, scanned_by, device_label, scanned_at, received_at, offline)
        SELECT ?1, t.id, ?2, CASE WHEN t.admitted_scan_id = ?1 THEN 'admitted' ELSE 'already_admitted' END, 0, ?3, ?4, ?5, ?7, ?8 FROM box_office_tickets t WHERE t.id = ?6`, // not-policy: numbered parameters
      params: [scanId, input.performanceId, actor, input.deviceLabel ?? null, at, ticket.id, received, offline],
    })
  }
  await unit.commit()
  const written = await all<{ id: string }>(`SELECT id FROM box_office_scans WHERE result = 'admitted' AND id IN (${scanIds.map(() => '?').join(', ')})`, ...scanIds)
  return { admitted: written.length, scanIds: written.map(r => r.id) }
}

/** Tickets issued and how many are in; `unpaid` is tickets reserved and not yet paid for, who may still come to the desk. */
export interface DoorSummary { tickets: number, admitted: number, unpaid: number }

/** How many valid tickets a performance has, and how many of them are in. */
export async function doorSummary(performanceId: string): Promise<DoorSummary> {
  const row = await first<{ tickets: number, admitted: number | null }>(
    "SELECT count(*) AS tickets, sum(CASE WHEN admitted_at IS NOT NULL THEN 1 ELSE 0 END) AS admitted FROM box_office_tickets WHERE performance_id = ? AND state = 'valid'", performanceId)
  const unpaid = await first<{ n: number }>(
    `SELECT count(*) AS n FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id
      WHERE l.performance_id = ? AND l.kind = 'ticket' AND l.state = 'live' AND o.state IN ('reserved', 'awaiting_payment')`, performanceId)
  return { tickets: Number(row?.tickets ?? 0), admitted: Number(row?.admitted ?? 0), unpaid: Number(unpaid?.n ?? 0) }
}
