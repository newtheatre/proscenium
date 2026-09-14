import { encode, renderSVG } from 'uqr'

// The same renderer the MFA enrolment screen uses client-side (app/pages/account/security.vue),
// here server-side for the in-app QR pages (D-108 criterion 1).
export function qrSvgBase64(data: string): string {
  return btoa(renderSVG(data))
}

export interface QrPngOptions {
  scale?: number
  border?: number
}

export interface QrPng {
  bytes: Uint8Array
  width: number
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
// The longest a stored deflate block can be; the encoder chains as many as the image needs.
const STORED_BLOCK_MAX = 65535

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
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

function be32(value: number): number[] {
  return [(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF]
}

function chunk(type: string, data: Uint8Array): number[] {
  const typed = new Uint8Array(4 + data.length)
  typed.set(new TextEncoder().encode(type))
  typed.set(data, 4)
  return [...be32(data.length), ...typed, ...be32(crc32(typed))]
}

// Workers has no zlib, so the stream is stored blocks: a zlib header, each block copied verbatim
// behind its length and complement, then the Adler-32 of the whole raw stream.
function zlibStored(raw: Uint8Array): Uint8Array {
  const out: number[] = [0x78, 0x01]
  for (let at = 0; at < raw.length || at === 0; at += STORED_BLOCK_MAX) {
    const length = Math.min(STORED_BLOCK_MAX, raw.length - at)
    const final = at + length >= raw.length
    out.push(final ? 1 : 0, length & 0xFF, length >>> 8, ~length & 0xFF, (~length >>> 8) & 0xFF)
    for (let i = 0; i < length; i += 1) out.push(raw[at + i]!)
    if (final) break
  }
  out.push(...be32(adler32(raw)))
  return Uint8Array.from(out)
}

// An 8-bit greyscale PNG of the code, one byte per pixel with a filter-0 byte leading each
// scanline. Error correction M matches what the door's decoder is proved against.
export function qrPng(text: string, { scale = 5, border = 4 }: QrPngOptions = {}): QrPng {
  const { data: matrix, size } = encode(text, { border: 0, ecc: 'M' })
  const width = (size + 2 * border) * scale
  const raw = new Uint8Array((width + 1) * width).fill(255)

  for (let y = 0; y < width; y += 1) {
    raw[y * (width + 1)] = 0
    const row = Math.floor(y / scale) - border
    if (row < 0 || row >= size) continue
    for (let column = 0; column < size; column += 1) {
      if (!matrix[row]![column]) continue
      const start = y * (width + 1) + 1 + (column + border) * scale
      raw.fill(0, start, start + scale)
    }
  }

  const ihdr = Uint8Array.from([...be32(width), ...be32(width), 8, 0, 0, 0, 0])
  const bytes = Uint8Array.from([
    ...PNG_SIGNATURE,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlibStored(raw)),
    ...chunk('IEND', new Uint8Array(0)),
  ])
  return { bytes, width }
}
