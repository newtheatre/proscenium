import { describe, expect, test } from 'bun:test'
import jsQR from 'jsqr'
import { encode } from 'uqr'
import { readScannedCode } from '#shared/utils/door'

// E-129 criterion 8: the decoder the door falls back to, proved against a real QR image rather
// than a camera. The picture is built here from the same renderer the confirmation email uses.

const SCALE = 4
const QUIET_ZONE = 4

// A greyscale bitmap in the RGBA layout `jsQR` reads, with the quiet zone a real printed code
// carries: without it a decoder finds no finder patterns at the edge of the image.
function bitmapOf(text: string): { data: Uint8ClampedArray, width: number, height: number } {
  const { data: matrix, size } = encode(text, { border: 0 })
  const width = (size + QUIET_ZONE * 2) * SCALE
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255)

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!matrix[row]![column]) continue
      for (let y = 0; y < SCALE; y += 1) {
        for (let x = 0; x < SCALE; x += 1) {
          const at = (((row + QUIET_ZONE) * SCALE + y) * width + (column + QUIET_ZONE) * SCALE + x) * 4
          pixels[at] = 0
          pixels[at + 1] = 0
          pixels[at + 2] = 0
        }
      }
    }
  }

  return { data: pixels, width, height: width }
}

function decode(text: string): string | null {
  const image = bitmapOf(text)
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null
}

describe('the fallback decoder reads a real QR image (criterion 8)', () => {
  test('a booking URL of the shape this build issues survives the round trip', () => {
    const url = 'https://newtheatre.org.uk/qr/r-01JABCDEF.ZmFrZS1zaWduYXR1cmU'
    expect(decode(url)).toBe(url)
  })

  test('a pass URL survives it too', () => {
    const url = 'https://newtheatre.org.uk/passes/pass-01JABCDEF.ZmFrZQ'
    expect(decode(url)).toBe(url)
  })

  test('a bare reference survives it', () => {
    expect(decode('K7M4PQ')).toBe('K7M4PQ')
  })
})

describe('decoded to resolved, the whole fallback path in one step', () => {
  test('a booking QR decodes and reads as a signed token for the door to resolve', () => {
    const decoded = decode('https://newtheatre.org.uk/qr/r-01JABCDEF.ZmFrZS1zaWduYXR1cmU')
    expect(readScannedCode(decoded!)).toEqual({ kind: 'BOOKING_TOKEN', value: 'r-01JABCDEF.ZmFrZS1zaWduYXR1cmU' })
  })

  test('a /t/<ref> QR decodes and reads straight through to the reference', () => {
    const decoded = decode('https://newtheatre.org.uk/t/K7M4PQ')
    expect(readScannedCode(decoded!)).toEqual({ kind: 'REFERENCE', value: 'K7M4PQ' })
  })
})
