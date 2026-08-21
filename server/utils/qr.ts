import { encode } from 'uqr'

/**
 * QR as a 1-bit PNG. Workers has no zlib and email clients will not render an
 * SVG, so the bytes are assembled here (docs/11 §3).
 */

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xFF]! ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const byte of bytes) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function be32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new TextEncoder().encode(type)
  const body = concat([typed, data])
  return concat([be32(data.length), body, be32(crc32(body))])
}

/**
 * A zlib stream of stored (uncompressed) deflate blocks. A 1-bit QR is a few
 * kilobytes either way, and this needs no compressor.
 */
function zlibStored(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])]
  const MAX = 0xFFFF
  for (let at = 0; at < raw.length || at === 0; at += MAX) {
    const slice = raw.subarray(at, Math.min(at + MAX, raw.length))
    const last = at + MAX >= raw.length ? 1 : 0
    const len = slice.length
    // LEN and its complement are little-endian here, unlike every PNG field.
    parts.push(new Uint8Array([last, len & 0xFF, (len >>> 8) & 0xFF, ~len & 0xFF, (~len >>> 8) & 0xFF]))
    parts.push(slice)
  }
  parts.push(be32(adler32(raw)))
  return concat(parts)
}

export interface QrOptions {
  /** Pixels per module. */
  scale?: number
  /** Quiet zone, in modules. Four is the specified minimum. */
  border?: number
}

/** Base64 for an email attachment, chunked so a large array never spreads. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }
  return btoa(binary)
}

/** A scannable QR for `text`, as PNG bytes. */
export function qrPng(text: string, { scale = 6, border = 4 }: QrOptions = {}): Uint8Array {
  const { size, data } = encode(text, { border: 0, ecc: 'M' })

  const modules = size + border * 2
  const width = modules * scale
  const bytesPerRow = Math.ceil(width / 8)

  // Bit depth 1, greyscale: 0 is black, 1 is white. Start all-white so the
  // quiet zone needs no special case.
  const raw = new Uint8Array((bytesPerRow + 1) * width).fill(0xFF)
  for (let y = 0; y < width; y++) raw[y * (bytesPerRow + 1)] = 0x00 // filter: None

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!data[row]?.[col]) continue
      for (let dy = 0; dy < scale; dy++) {
        const y = (border + row) * scale + dy
        const rowStart = y * (bytesPerRow + 1) + 1
        for (let dx = 0; dx < scale; dx++) {
          const x = (border + col) * scale + dx
          raw[rowStart + (x >> 3)]! &= ~(0x80 >> (x & 7))
        }
      }
    }
  }

  const ihdr = concat([be32(width), be32(width), new Uint8Array([1, 0, 0, 0, 0])])
  return concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array(0))])
}
