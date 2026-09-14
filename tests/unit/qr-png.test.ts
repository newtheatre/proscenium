import { describe, expect, test } from 'bun:test'
import { encode } from 'uqr'
import { qrPng } from '#server/utils/qr'

// D-108 criterion 2: the confirmation email's QR is a hosted PNG, because Gmail renders neither
// a data: URI nor SVG. The encoder is hand-assembled, so its bytes are checked field by field.

const SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const TEXT = 'https://newtheatre.org.uk/qr/r-1.sig'

function be32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
}

// An independent CRC-32, so the test does not trust the encoder's own table.
function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }
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

interface Chunk { type: string, data: Uint8Array, crc: number }

// Bun's inflate reads the bare deflate body; the zlib header and Adler-32 trailer around it are
// checked by hand below.
function inflate(zlib: Uint8Array): Uint8Array {
  return Bun.inflateSync(Uint8Array.from(zlib.subarray(2, zlib.length - 4)))
}

function chunksOf(bytes: Uint8Array): Chunk[] {
  const chunks: Chunk[] = []
  let at = SIGNATURE.length
  while (at < bytes.length) {
    const length = be32(bytes, at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    chunks.push({ type, data: bytes.subarray(at + 8, at + 8 + length), crc: be32(bytes, at + 8 + length) })
    at += 12 + length
  }
  return chunks
}

describe('qrPng assembles a valid 8-bit greyscale PNG', () => {
  const { bytes, width } = qrPng(TEXT, { scale: 3, border: 2 })
  const chunks = chunksOf(bytes)
  const ihdr = chunks[0]!
  const idat = chunks.find(chunk => chunk.type === 'IDAT')!

  test('starts with the PNG signature and ends with IEND', () => {
    expect([...bytes.subarray(0, 8)]).toEqual(SIGNATURE)
    expect(chunks.map(chunk => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  test('the width is the module count plus the quiet zone, scaled', () => {
    const { size } = encode(TEXT, { border: 0, ecc: 'M' })
    expect(width).toBe((size + 2 * 2) * 3)
  })

  test('IHDR names a square 8-bit greyscale image with no interlace', () => {
    expect(ihdr.data.length).toBe(13)
    expect(be32(ihdr.data, 0)).toBe(width)
    expect(be32(ihdr.data, 4)).toBe(width)
    expect([...ihdr.data.subarray(8)]).toEqual([8, 0, 0, 0, 0])
  })

  test('every chunk CRC covers its type and data', () => {
    for (const chunk of chunks) {
      const covered = new Uint8Array([...new TextEncoder().encode(chunk.type), ...chunk.data])
      expect(`${chunk.type}: ${chunk.crc.toString(16)}`).toBe(`${chunk.type}: ${crc32(covered).toString(16)}`)
    }
  })

  test('IDAT is a zlib stream of stored blocks whose Adler-32 matches the raw scanlines', () => {
    expect(idat.data[0]).toBe(0x78)
    const raw = inflate(idat.data)
    expect(raw.length).toBe((width + 1) * width)
    expect(be32(idat.data, idat.data.length - 4)).toBe(adler32(raw))
    // Stored blocks only: the first block header byte is BTYPE 00, final or not.
    expect(idat.data[2]! & 0b110).toBe(0)
  })

  test('the scanlines carry the dark modules exactly where the encoder put them', () => {
    const { data: matrix, size } = encode(TEXT, { border: 0, ecc: 'M' })
    const raw = inflate(idat.data)
    const pixel = (x: number, y: number): number => raw[y * (width + 1) + 1 + x]!
    for (let y = 0; y < width; y += 1) {
      expect(raw[y * (width + 1)]).toBe(0)
    }
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const expected = matrix[row]![column] ? 0 : 255
        expect(pixel((column + 2) * 3 + 1, (row + 2) * 3 + 1)).toBe(expected)
      }
    }
    expect(pixel(0, 0)).toBe(255)
    expect(pixel(width - 1, width - 1)).toBe(255)
  })

  test('the defaults are a quiet zone of four modules at five pixels each', () => {
    const { size } = encode(TEXT, { border: 0, ecc: 'M' })
    expect(qrPng(TEXT).width).toBe((size + 8) * 5)
  })
})
