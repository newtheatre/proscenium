// Tickets and their door codes (Box office specification, part 3, "A ticket", and part 4, "The
// door"). A ticket is issued when its order is confirmed, one per ticket line, with a fresh random
// code. The buyer gets the code inside a signed door code, `tkt.<key id>.<code>.<signature>`, which
// a device can check with no connection; the database keeps only the hash of the code part.
import { sql } from 'drizzle-orm'
import { all, newId, sealColumn, openColumn, type UnitView } from '#kit'
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
 * The code part is kept sealed on the ticket, so the ticket can be shown again (`doorCodesForOrder`). With
 * `admit`, the buyer is at the desk: each ticket is admitted as it is issued, with its scan row,
 * exactly as the door would have written it.
 */
export async function issueTickets(unit: UnitView, lines: readonly { id: string, performance_id: string }[], admit?: { by: string, at: number }): Promise<string[]> {
  // An order of passes alone has no tickets to issue.
  if (!lines.length) return []
  const made = await Promise.all(lines.map(async (line) => {
    const code = base32(crypto.getRandomValues(new Uint8Array(CODE_BYTES)))
    const { keyId, signature } = await signing.sign(DOOR_CODE_PURPOSE, id => signedPart(TICKET_KIND, id, code))
    return { line, keyId, codeHash: await hashOf(code), sealed: await sealColumn(code), doorCode: `${signedPart(TICKET_KIND, keyId, code)}.${signature}`, scanId: admit ? newId('scan') : null }
  }))
  const ids = unit.insertSet(tickets, made.map(m => ({
    orderLineId: m.line.id, performanceId: m.line.performance_id, codeHash: m.codeHash, doorCode: m.sealed, keyId: m.keyId, state: 'valid', admittedAt: admit ? admit.at : null, admittedScanId: m.scanId,
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

/** Signs a ticket's code part afresh with the current key: `tkt.<key id>.<code>.<signature>`. */
async function signTicketCode(code: string): Promise<string> {
  const { keyId, signature } = await signing.sign(DOOR_CODE_PURPOSE, id => signedPart(TICKET_KIND, id, code))
  return `${signedPart(TICKET_KIND, keyId, code)}.${signature}`
}

export interface ShownTicket { ticketId: string, lineId: string, performanceId: string, admitted: boolean, doorCode: string | null }

/**
 * The valid tickets of the given orders, each with its door code signed afresh, for showing the
 * tickets again to whoever may already see the order (the booking link, the buyer signed in). The
 * caller decides that. A ticket issued before codes were kept has `doorCode: null`: its code is only
 * in the confirmation email.
 */
export async function doorCodesForOrders(orderIds: readonly string[]): Promise<ShownTicket[]> {
  if (!orderIds.length) return []
  const rows = await all<{ id: string, order_line_id: string, performance_id: string, admitted_at: number | null, door_code: string | null }>(
    `SELECT t.id, t.order_line_id, t.performance_id, t.admitted_at, t.door_code FROM box_office_tickets t
     JOIN box_office_order_lines l ON l.id = t.order_line_id
     WHERE l.order_id IN (SELECT value FROM json_each(?)) AND l.state = 'live' AND t.state = 'valid'
     ORDER BY l.created_at, l.id`, JSON.stringify(orderIds))
  return Promise.all(rows.map(async r => ({
    ticketId: r.id,
    lineId: r.order_line_id,
    performanceId: r.performance_id,
    admitted: r.admitted_at !== null,
    doorCode: r.door_code ? await signTicketCode(await openColumn(r.door_code) as string) : null,
  })))
}

/** One order's tickets: see `doorCodesForOrders`. */
export const doorCodesForOrder = (orderId: string) => doorCodesForOrders([orderId])

/**
 * The short numbers a person reads off their tickets, one for each line given: the booking reference
 * and the line's place among every ticket line the order has had, `K7MPQ2XR-1`, so a ticket keeps its
 * number when others are cancelled. They name a ticket and open nothing; the door scans the code.
 */
export async function ticketNumbers(order: { id: string, reference: string }, lineIds: readonly string[]): Promise<string[]> {
  const places = (await all<{ id: string }>("SELECT id FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' ORDER BY id", order.id)).map(r => r.id)
  return lineIds.map(id => `${order.reference}-${places.indexOf(id) + 1}`)
}
