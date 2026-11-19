// The door offline (D2, box office review; Box office specification, part 4, "The door"). Door codes
// are signed so a device holding only the public keys can check them with no connection. Before the
// doors open the live door keeps a copy of the performance's door list on the device: the keys, the
// hash of each valid ticket's code with whether it is in, and each booking by name. Offline, the
// device checks a scanned code's signature, finds its hash in that copy and admits it there, and
// keeps the admission until it can send it; this module takes those admissions when it does. Each
// carries the id the device gave the scan, so sending the same one twice admits nobody twice.
import { accountLabel } from '#modules/core'
import { all, first } from '#kit'
import { signing, type PublicSigningKey } from '#kit/signing'
import { admitByName, scan, type ScanOutcome } from './door'
import { DOOR_CODE_PURPOSE } from './tickets'

export interface DoorPackBooking {
  id: string
  reference: string
  buyer: string | null
  channel: string
  at: number
  tickets: number
  admitted: number
  /** A reservation not yet paid for: what is owed. Nobody on it is admitted at the door. */
  unpaid?: { amountDueMinor: number, currency: string }
  /** A reservation's desk code, hashed as the server keeps it, so a typed desk code is found offline. */
  deskHash?: string
}

export interface DoorPack {
  performanceId: string
  /** When the copy was made, by the server's clock. */
  madeAt: number
  keys: PublicSigningKey[]
  /** Each valid ticket for the performance: its code's hash, its booking and whether it is in. */
  tickets: { hash: string, orderId: string, ticketType: string, in: boolean }[]
  bookings: DoorPackBooking[]
  /** Each pass with a paid entry tonight: its code's hashes, as typed and as another system's, and its entry ticket's hash. */
  passes?: { hashes: string[], ticketHash: string }[]
}

/** The copy of a performance's door the live door keeps on the device. */
export async function doorPack(performanceId: string, madeAt: number): Promise<DoorPack> {
  const tickets = await all<{ hash: string, order_id: string, type_name: string, admitted_at: number | null }>(
    `SELECT k.code_hash AS hash, l.order_id, y.name AS type_name, k.admitted_at FROM box_office_tickets k JOIN box_office_order_lines l ON l.id = k.order_line_id
      JOIN box_office_ticket_types y ON y.id = l.ticket_type_id WHERE k.performance_id = ? AND k.state = 'valid' ORDER BY k.id`, performanceId)
  const orders = await all<{ id: string, reference: string, account_id: string | null, channel: string, at: number, state: string, total_minor: number, currency: string, desk_code_hash: string | null, lines: number }>(
    `SELECT o.id, o.reference, o.account_id, o.channel, coalesce(o.confirmed_at, o.created_at) AS at, o.state, o.total_minor, o.currency, o.desk_code_hash,
        (SELECT count(*) FROM box_office_order_lines l WHERE l.order_id = o.id AND l.performance_id = ? AND l.kind = 'ticket' AND l.state = 'live') AS lines
      FROM box_office_orders o WHERE o.state IN ('reserved', 'awaiting_payment', 'confirmed')
        AND EXISTS (SELECT 1 FROM box_office_order_lines l WHERE l.order_id = o.id AND l.performance_id = ? AND l.kind = 'ticket' AND l.state = 'live')
      ORDER BY o.reference`, performanceId, performanceId)
  const bookings: DoorPackBooking[] = []
  for (const o of orders) {
    const own = tickets.filter(t => t.order_id === o.id)
    const unpaid = o.state !== 'confirmed'
    if (!unpaid && !own.length) continue
    bookings.push({
      id: o.id, reference: o.reference, buyer: o.account_id ? await accountLabel(o.account_id) : null, channel: o.channel, at: o.at,
      tickets: unpaid ? Number(o.lines) : own.length, admitted: own.filter(t => t.admitted_at !== null).length,
      ...unpaid ? { unpaid: { amountDueMinor: o.total_minor, currency: o.currency }, ...o.desk_code_hash ? { deskHash: o.desk_code_hash } : {} } : {},
    })
  }
  const passes = await all<{ code_hash: string, alias_hash: string | null, ticket_hash: string }>(
    `SELECT p.code_hash, p.alias_hash, k.code_hash AS ticket_hash FROM box_office_pass_redemptions r JOIN box_office_passes p ON p.id = r.pass_id
      JOIN box_office_order_lines l ON l.pass_redemption_id = r.id AND l.state = 'live' JOIN box_office_tickets k ON k.order_line_id = l.id AND k.state = 'valid'
      WHERE r.performance_id = ? AND r.state = 'live' AND p.state = 'active'`, performanceId)
  return {
    performanceId,
    madeAt,
    passes: passes.map(p => ({ hashes: [p.code_hash, ...p.alias_hash ? [p.alias_hash] : []], ticketHash: p.ticket_hash })),
    keys: await signing.publicKeys(DOOR_CODE_PURPOSE),
    tickets: tickets.map(t => ({ hash: t.hash, orderId: t.order_id, ticketType: t.type_name, in: t.admitted_at !== null })),
    bookings,
  }
}

export type OfflineItem
  = | { kind: 'code', id: string, code: string, at: number }
    | { kind: 'name', ids: string[], orderId: string, at: number }

export interface OfflineResult {
  /** The device's id for the item: the scan's, or the first of a name admission's. */
  id: string
  /** What the server made of it: admitted, already in (another device was first), or why not. */
  result: ScanOutcome['result'] | 'sent'
  admitted?: number
  booking?: ScanOutcome['booking']
}

/** Takes admissions made offline, oldest first. One sent before answers 'sent' and changes nothing. */
export async function takeOffline(performanceId: string, items: OfflineItem[], deviceLabel: string | null): Promise<OfflineResult[]> {
  const results: OfflineResult[] = []
  for (const item of [...items].sort((a, b) => a.at - b.at)) {
    const ids = item.kind === 'code' ? [item.id] : item.ids
    const seen = await first<{ n: number }>(`SELECT count(*) AS n FROM box_office_scans WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids)
    if (Number(seen?.n ?? 0) > 0) {
      results.push({ id: ids[0]!, result: 'sent' })
      continue
    }
    if (item.kind === 'code') {
      const out = await scan({ performanceId, code: item.code, deviceLabel, offline: { id: item.id, scannedAt: item.at } })
      results.push({ id: item.id, result: out.result, ...out.booking ? { booking: out.booking } : {} })
    }
    else {
      const out = await admitByName({ performanceId, orderId: item.orderId, count: item.ids.length, deviceLabel, offline: { ids: item.ids, scannedAt: item.at } })
      results.push({ id: item.ids[0]!, result: out.admitted ? 'admitted' : 'already_admitted', admitted: out.admitted })
    }
  }
  return results
}
