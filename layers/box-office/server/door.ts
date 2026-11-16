// The door (Box office specification, part 3, "A ticket", and part 4, "The door"; BO-40). A scanned
// code is checked for its signature, hashed, and the ticket found by the hash. Admission is one
// conditional update, so a ticket is admitted exactly once however many devices scan it together:
// the scan row written in the same batch records whether this scan was the one. A desk code or a
// booking reference admits nobody and writes no scan row.
import { createUnit, first, newId, nowMs, useContext } from '#kit'
import { signing } from '#kit/signing'
import { hashOf } from './codes'
import { DOOR_CODE_PURPOSE, signedPart, TICKET_KIND } from './tickets'

export type ScanResult = 'admitted' | 'already_admitted' | 'void' | 'wrong_performance' | 'unknown' | 'bad_signature' | 'not_paid'

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

  // One conditional update admits; the scan row beside it says whether this scan was the one.
  unit.view().add({ sql: "UPDATE box_office_tickets SET admitted_at = ?, updated_at = ? WHERE id = ? AND state = 'valid' AND admitted_at IS NULL AND performance_id = ?", params: [at, at, ticket.id, input.performanceId] })
  unit.view().add({
    sql: `INSERT INTO box_office_scans (id, ticket_id, performance_id, result, unchecked, scanned_by, device_label, scanned_at, received_at, offline)
      VALUES (?, ?, ?, CASE WHEN changes() > 0 THEN 'admitted' ELSE 'already_admitted' END, 0, ?, ?, ?, ?, 0)`,
    params: [scanId, ticket.id, input.performanceId, actor, input.deviceLabel ?? null, at, at],
  })
  await unit.commit()
  const written = await first<{ result: 'admitted' | 'already_admitted' }>('SELECT result FROM box_office_scans WHERE id = ?', scanId)
  if (written?.result === 'admitted') return { result: 'admitted', scanId, ticketId: ticket.id }
  const earlier = await first<{ scanned_at: number, device_label: string | null }>("SELECT scanned_at, device_label FROM box_office_scans WHERE ticket_id = ? AND result IN ('admitted', 'admitted_by_override') ORDER BY scanned_at DESC LIMIT 1", ticket.id)
  return { result: 'already_admitted', scanId, ticketId: ticket.id, admittedAt: earlier?.scanned_at, admittedAtDoor: earlier?.device_label ?? null }
}
