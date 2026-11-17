// Whether an address may receive a webhook (C-49): HTTPS only, and never a private, local or
// otherwise reserved network. A host given by name is checked for the names that always mean a
// local machine; a Worker cannot reach a private network by name, and its fetch refuses one by
// address, but saying so at save time is clearer than a delivery that never arrives.

/** Why an address is refused, as a code; null when it may be used. */
export function refusedAddress(value: string): 'not-a-url' | 'not-https' | 'credentials' | 'private' | null {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return 'not-a-url'
  }
  if (url.protocol !== 'https:') return 'not-https'
  if (url.username || url.password) return 'credentials'
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (isPrivateHost(host)) return 'private'
  return null
}

const LOCAL_NAMES = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|home\.arpa)$/

export function isPrivateHost(host: string): boolean {
  if (!host.includes('.') && !host.includes(':') && !host.startsWith('[')) return true // a single-label name is someone's own network
  if (LOCAL_NAMES.test(host)) return true
  const v4 = ipv4(host)
  if (v4) return privateIpv4(v4)
  if (host.startsWith('[') && host.endsWith(']')) return privateIpv6(host.slice(1, -1))
  return false
}

function ipv4(host: string): number[] | null {
  const parts = host.split('.')
  if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p))) return null // not-policy: dotted quad
  const n = parts.map(Number)
  return n.every(x => x <= 255) ? n : null // not-policy: an octet's ceiling
}

// The reserved IPv4 ranges (RFC 6890 and its successors), each a first octet and the range of second octets.
const RESERVED_V4: [number, number, number][] = [[0, 0, 255], [10, 0, 255], [127, 0, 255], [100, 64, 127], [169, 254, 254], [172, 16, 31], [192, 168, 168], [192, 0, 0], [198, 18, 19]] // not-policy: the reserved ranges
const MULTICAST_AND_ABOVE = 224 // not-policy: 224.0.0.0 and above are multicast or reserved

function privateIpv4([a, b]: number[]): boolean {
  return a! >= MULTICAST_AND_ABOVE || RESERVED_V4.some(([first, from, to]) => a === first && b! >= from && b! <= to)
}

// not-policy: the reserved IPv6 ranges
function privateIpv6(address: string): boolean {
  const a = address.toLowerCase()
  if (a === '::' || a === '::1') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
  if (mapped) return privateIpv4(ipv4(mapped[1]!) ?? [0, 0])
  // The address parser writes an IPv4-mapped address in hex ("::ffff:a00:1" for 10.0.0.1).
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a) // not-policy: an IPv6 group is up to four hex digits
  if (hex) return privateIpv4([Number.parseInt(hex[1]!, 16) >> 8, Number.parseInt(hex[1]!, 16) & 0xFF]) // not-policy: the octets of a 16-bit group
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(a)
}

/** What the console shows of an address once saved: its host alone. */
export function addressHint(value: string): string {
  return new URL(value).host
}
