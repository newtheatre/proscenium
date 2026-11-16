// A small zip writer for the data download (ID-15): files are stored, not compressed, which every
// unzip tool opens and which keeps the Worker's work to one pass over the bytes. Names are UTF-8.
const encoder = new TextEncoder()

const CRC_TABLE = (() => {
  const table = new Uint32Array(256) // not-policy: one entry per byte value
  for (let n = 0; n < 256; n++) { // not-policy: one entry per byte value
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1 // not-policy: the CRC-32 polynomial
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF // not-policy: CRC-32's starting value
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF]! ^ (c >>> 8) // not-policy: CRC-32
  return (c ^ 0xFFFFFFFF) >>> 0 // not-policy: CRC-32's final xor
}

export interface ZipEntry { name: string, bytes: Uint8Array | string }

/** DOS date and time for the entries: the moment the zip is made, in UTC. */
function dosTime(at: Date): { time: number, date: number } {
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1), // not-policy: the zip format
    date: ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(), // not-policy: the zip format
  }
}

/** A zip archive holding these files, in this order. */
export function zip(entries: ZipEntry[], at = new Date()): Uint8Array {
  const { time, date } = dosTime(at)
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = typeof entry.bytes === 'string' ? encoder.encode(entry.bytes) : entry.bytes
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length) // not-policy: the zip format's local header
    const l = new DataView(local.buffer)
    l.setUint32(0, 0x04034B50, true) // not-policy: the zip format
    l.setUint16(4, 20, true) // not-policy: version needed, 2.0
    l.setUint16(6, 0x0800, true) // not-policy: the names are UTF-8
    l.setUint16(8, 0, true) // not-policy: stored
    l.setUint16(10, time, true) // not-policy: a field offset in the zip format
    l.setUint16(12, date, true) // not-policy: a field offset in the zip format
    l.setUint32(14, crc, true) // not-policy: a field offset in the zip format
    l.setUint32(18, data.length, true) // not-policy: a field offset in the zip format
    l.setUint32(22, data.length, true) // not-policy: a field offset in the zip format
    l.setUint16(26, name.length, true) // not-policy: a field offset in the zip format
    local.set(name, 30) // not-policy: the zip format
    locals.push(local, data)

    const central = new Uint8Array(46 + name.length) // not-policy: the zip format's central header
    const c = new DataView(central.buffer)
    c.setUint32(0, 0x02014B50, true) // not-policy: the zip format
    c.setUint16(4, 20, true) // not-policy: version made by
    c.setUint16(6, 20, true) // not-policy: version needed
    c.setUint16(8, 0x0800, true) // not-policy: the names are UTF-8
    c.setUint16(10, 0, true) // not-policy: stored
    c.setUint16(12, time, true) // not-policy: a field offset in the zip format
    c.setUint16(14, date, true) // not-policy: a field offset in the zip format
    c.setUint32(16, crc, true) // not-policy: a field offset in the zip format
    c.setUint32(20, data.length, true) // not-policy: a field offset in the zip format
    c.setUint32(24, data.length, true) // not-policy: a field offset in the zip format
    c.setUint16(28, name.length, true) // not-policy: a field offset in the zip format
    c.setUint32(42, offset, true) // not-policy: a field offset in the zip format
    central.set(name, 46) // not-policy: the zip format
    centrals.push(central)

    offset += local.length + data.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = new Uint8Array(22) // not-policy: the zip format's end record
  const e = new DataView(end.buffer)
  e.setUint32(0, 0x06054B50, true) // not-policy: the zip format
  e.setUint16(8, entries.length, true) // not-policy: a field offset in the zip format
  e.setUint16(10, entries.length, true) // not-policy: a field offset in the zip format
  e.setUint32(12, centralSize, true) // not-policy: a field offset in the zip format
  e.setUint32(16, offset, true) // not-policy: a field offset in the zip format

  const out = new Uint8Array(offset + centralSize + end.length)
  let at2 = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at2)
    at2 += part.length
  }
  return out
}
