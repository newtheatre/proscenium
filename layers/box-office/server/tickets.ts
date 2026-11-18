// Tickets and their door codes (Box office specification, part 3, "A ticket", and part 4, "The
// door"). A ticket is issued when its order is confirmed, one per ticket line, with a fresh random
// code. The buyer gets the code inside a signed door code, `tkt.<key id>.<code>.<signature>`, which
// a device can check with no connection; the database keeps only the hash of the code part.
import { sql } from 'drizzle-orm'
import { newId, nowMs, type UnitView } from '#kit'
import { signing } from '#kit/signing'
import { scans, tickets } from './db/schema'
import { hashOf } from './codes'

export const DOOR_CODE_PURPOSE = 'box-office.door-code'
export const TICKET_KIND = 'tkt'

const CODE_BYTES = 16 // not-policy: 128 random bits, as the door code format gives
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' // not-policy: the standard base32 alphabet
const FIVE = 5 // not-policy: bits in a base32 character
const BYTE = 8 // not-policy: bits in a byte

function base32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << BYTE) | byte
    bits += BYTE
    while (bits >= FIVE) {
      out += BASE32[(value >>> (bits - FIVE)) & (BASE32.length - 1)]
      bits -= FIVE
    }
  }
  if (bits > 0) out += BASE32[(value << (FIVE - bits)) & (BASE32.length - 1)]
  return out
}

/** What the signature of a door code covers: its first three parts. */
export const signedPart = (kind: string, keyId: string, code: string) => `${kind}.${keyId}.${code}`

/**
 * Adds a valid ticket for each line to the unit and returns the door codes, in the lines' order.
 * The codes exist only in what is returned: hand them to the buyer and keep them nowhere. With
 * `admit`, the buyer is at the desk: each ticket is admitted as it is issued, with its scan row,
 * exactly as the door would have written it.
 */
/** A fresh door code: what the buyer is given, and what the ticket keeps of it. */
async function freshCode(): Promise<{ keyId: string, codeHash: string, doorCode: string }> {
  const code = base32(crypto.getRandomValues(new Uint8Array(CODE_BYTES)))
  const { keyId, signature } = await signing.sign(DOOR_CODE_PURPOSE, id => signedPart(TICKET_KIND, id, code))
  return { keyId, codeHash: await hashOf(code), doorCode: `${signedPart(TICKET_KIND, keyId, code)}.${signature}` }
}

/**
 * Issues tickets again with new door codes, so they can be sent to a buyer after the sale: the codes
 * they had were handed out once and kept nowhere. Only tickets not yet admitted are reissued; each
 * old one is voided as reissued, so a code shown before stops working. Returns the new codes.
 */
export async function reissueTickets(unit: UnitView, waiting: readonly { ticketId: string, line: { id: string, performance_id: string } }[]): Promise<string[]> {
  const at = nowMs()
  for (const w of waiting) {
    unit.add(sql`UPDATE box_office_tickets SET state = 'void', void_reason = 'reissued', updated_at = ${at} WHERE id = ${w.ticketId} AND state = 'valid' AND admitted_at IS NULL`)
      .expect(1, { code: 'box-office.ticket.changed', reason: 'One of these tickets has just been used or changed.', remedy: 'Look at the booking again.' })
  }
  return issueTickets(unit, waiting.map(w => w.line))
}

export async function issueTickets(unit: UnitView, lines: readonly { id: string, performance_id: string }[], admit?: { by: string, at: number }): Promise<string[]> {
  const made = await Promise.all(lines.map(async line => ({ line, ...await freshCode(), scanId: admit ? newId('scan') : null })))
  const ids = unit.insertSet(tickets, made.map(m => ({
    orderLineId: m.line.id, performanceId: m.line.performance_id, codeHash: m.codeHash, keyId: m.keyId, state: 'valid', admittedAt: admit ? admit.at : null, admittedScanId: m.scanId,
  })))
  unit.expect(made.length, { code: 'box-office.ticket.not-issued', reason: 'The tickets could not be issued.' })
  // What a line met to be sold goes onto its ticket, so the door can check it again.
  unit.add(sql`UPDATE box_office_tickets SET requirement_ref = l.requirement_ref, requirement_account_id = l.requirement_account_id, requirement_evidence_id = l.requirement_evidence_id
    FROM box_office_order_lines l WHERE l.id = box_office_tickets.order_line_id AND l.requirement_ref IS NOT NULL AND box_office_tickets.id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
  if (admit) {
    unit.insertSet(scans, made.map((m, i) => ({
      id: m.scanId!, ticketId: ids[i]!, performanceId: m.line.performance_id, result: 'admitted', scannedBy: admit.by, deviceLabel: 'Desk', scannedAt: admit.at, receivedAt: admit.at,
    })))
    unit.expect(made.length, { code: 'box-office.ticket.not-issued', reason: 'The tickets could not be issued.' })
  }
  return made.map(m => m.doorCode)
}
