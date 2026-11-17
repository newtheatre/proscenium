// The door (Box office specification, part 3, "A ticket", and part 4, "The door"; BO-40). A scanned
// code is checked for its signature, hashed, and the ticket found by the hash. Admission is one
// conditional update that stamps the ticket with the scan's id, so a ticket is admitted exactly
// once however many devices scan it together, and the scan row written next in the same batch takes
// its result from that stamp: admitted if the stamp is its own id, already admitted otherwise. A desk code or a
// booking reference admits nobody and writes no scan row.
import { all, can, createUnit, first, newId, nowMs, useContext } from '#kit'
import { signing } from '#kit/signing'
import { hashOf } from './codes'
import { doorCodeKind } from './door-codes'
import { DOOR_CODE_PURPOSE, signedPart, TICKET_KIND } from './tickets'

export type ScanResult = 'admitted' | 'already_admitted' | 'void' | 'wrong_performance' | 'unknown' | 'bad_signature' | 'not_paid' | 'card' | 'card_not_allowed'

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
  /** A code of another kind (box-office.door-code), such as a membership card: what it says. */
  card?: { kind: string, headline: string, line: string, state: 'ok' | 'attention' }
}

export interface ScanInput { performanceId: string, code: string, deviceLabel?: string | null }

interface TicketRow { id: string, performance_id: string, state: 'valid' | 'void', void_reason: string | null, admitted_at: number | null }

const PARTS = 4 // not-policy: kind, key id, code and signature

/** Scans one code at the door of a performance, in a unit of its own, and says what happened. */
export async function scan(input: ScanInput): Promise<ScanOutcome> {
  const code = input.code.trim()
  const parts = code.split('.')
  const at = nowMs()
  const actor = useContext().actor.accountId ?? null
  const unit = createUnit()
  const scanId = newId('scan')
  const row = (result: string, ticketId: string | null) => unit.view().add({
    sql: 'INSERT INTO box_office_scans (id, ticket_id, performance_id, result, unchecked, scanned_by, device_label, scanned_at, received_at, offline) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 0)',
    params: [scanId, ticketId, input.performanceId, result, actor, input.deviceLabel ?? null, at, at],
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
    // What a reservation's message carries is not a ticket: the desk takes the payment first.
    const reservation = await first<{ id: string }>("SELECT id FROM box_office_orders WHERE state IN ('reserved', 'awaiting_payment') AND (desk_code_hash = ? OR reference = ?)", await hashOf(code.toUpperCase()), code.toUpperCase())
    if (reservation) return { result: 'not_paid', scanId: null }
    return recorded({ result: 'unknown' })
  }
  const [kind, keyId, random, signature] = parts as [string, string, string, string]
  if (!await signing.verify(DOOR_CODE_PURPOSE, keyId, signedPart(kind, keyId, random), signature)) return recorded({ result: 'bad_signature' })

  const ticket = await first<TicketRow>('SELECT id, performance_id, state, void_reason, admitted_at FROM box_office_tickets WHERE code_hash = ?', await hashOf(random))
  if (!ticket) return recorded({ result: 'unknown' })
  if (ticket.state === 'void') return recorded({ result: 'void', ticketId: ticket.id, voidReason: ticket.void_reason ?? undefined }, ticket.id)
  if (ticket.performance_id !== input.performanceId) return recorded({ result: 'wrong_performance', ticketId: ticket.id, ticketPerformanceId: ticket.performance_id }, ticket.id)

  // One conditional update admits and stamps; the scan row reads the stamp to say whether it was the one.
  unit.view().add({ sql: "UPDATE box_office_tickets SET admitted_at = ?, admitted_scan_id = ?, updated_at = ? WHERE id = ? AND state = 'valid' AND admitted_at IS NULL AND performance_id = ?", params: [at, scanId, at, ticket.id, input.performanceId] })
  unit.view().add({
    sql: `INSERT INTO box_office_scans (id, ticket_id, performance_id, result, unchecked, scanned_by, device_label, scanned_at, received_at, offline)
      SELECT ?1, t.id, ?2, CASE WHEN t.admitted_scan_id = ?1 THEN 'admitted' ELSE 'already_admitted' END, 0, ?3, ?4, ?5, ?5, 0 FROM box_office_tickets t WHERE t.id = ?6`, // not-policy: numbered parameters
    params: [scanId, input.performanceId, actor, input.deviceLabel ?? null, at, ticket.id],
  })
  await unit.commit()
  const written = await first<{ result: 'admitted' | 'already_admitted' }>('SELECT result FROM box_office_scans WHERE id = ?', scanId)
  if (written?.result === 'admitted') return { result: 'admitted', scanId, ticketId: ticket.id }
  const earlier = await first<{ scanned_at: number, device_label: string | null }>('SELECT s.scanned_at, s.device_label FROM box_office_tickets t JOIN box_office_scans s ON s.id = t.admitted_scan_id WHERE t.id = ?', ticket.id)
  return { result: 'already_admitted', scanId, ticketId: ticket.id, admittedAt: earlier?.scanned_at, admittedAtDoor: earlier?.device_label ?? null }
}

export interface AdmitByNameInput { performanceId: string, orderId: string, count: number, deviceLabel?: string | null }

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
  const at = nowMs()
  const actor = useContext().actor.accountId ?? null
  const unit = createUnit()
  const scanIds: string[] = []
  for (const ticket of waiting) {
    const scanId = newId('scan')
    scanIds.push(scanId)
    unit.view().add({ sql: "UPDATE box_office_tickets SET admitted_at = ?, admitted_scan_id = ?, updated_at = ? WHERE id = ? AND state = 'valid' AND admitted_at IS NULL AND performance_id = ?", params: [at, scanId, at, ticket.id, input.performanceId] })
    unit.view().add({
      sql: `INSERT INTO box_office_scans (id, ticket_id, performance_id, result, unchecked, scanned_by, device_label, scanned_at, received_at, offline)
        SELECT ?1, t.id, ?2, CASE WHEN t.admitted_scan_id = ?1 THEN 'admitted' ELSE 'already_admitted' END, 0, ?3, ?4, ?5, ?5, 0 FROM box_office_tickets t WHERE t.id = ?6`, // not-policy: numbered parameters
      params: [scanId, input.performanceId, actor, input.deviceLabel ?? null, at, ticket.id],
    })
  }
  await unit.commit()
  const written = await all<{ id: string }>(`SELECT id FROM box_office_scans WHERE result = 'admitted' AND id IN (${scanIds.map(() => '?').join(', ')})`, ...scanIds)
  return { admitted: written.length, scanIds: written.map(r => r.id) }
}
