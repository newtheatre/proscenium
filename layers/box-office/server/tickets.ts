// Tickets and their door codes (Box office specification, part 3, "A ticket", and part 4, "The
// door"). A ticket is issued when its order is confirmed, one per ticket line, with a fresh random
// code. The buyer gets the code inside a signed door code, `tkt.<key id>.<code>.<signature>`, which
// a device can check with no connection; the database keeps only the hash of the code part.
import type { UnitView } from '#kit'
import { signing } from '#kit/signing'
import { tickets } from './db/schema'
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
 * The codes exist only in what is returned: hand them to the buyer and keep them nowhere.
 */
export async function issueTickets(unit: UnitView, lines: readonly { id: string, performance_id: string }[]): Promise<string[]> {
  const made = await Promise.all(lines.map(async (line) => {
    const code = base32(crypto.getRandomValues(new Uint8Array(CODE_BYTES)))
    const { keyId, signature } = await signing.sign(DOOR_CODE_PURPOSE, id => signedPart(TICKET_KIND, id, code))
    return { line, keyId, codeHash: await hashOf(code), doorCode: `${signedPart(TICKET_KIND, keyId, code)}.${signature}` }
  }))
  unit.insertSet(tickets, made.map(m => ({ orderLineId: m.line.id, performanceId: m.line.performance_id, codeHash: m.codeHash, keyId: m.keyId, state: 'valid' })))
  unit.expect(made.length)
  return made.map(m => m.doorCode)
}
