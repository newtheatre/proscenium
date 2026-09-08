import { describe, expect, test } from 'bun:test'
import { decodeQrToken, encodeQrToken } from '#shared/utils/qr-tokens'

// The token shape only: the signature itself is server/utils/qr-tokens.ts, which needs the
// worker secret and so is exercised in tests/integration/qr-tokens.test.ts instead (D-108).

describe('a QR token is a reservation id and its signature, joined unambiguously', () => {
  test('encoding then decoding returns the same pair', () => {
    const token = encodeQrToken('r-1', 'sig-abc')
    expect(decodeQrToken(token)).toEqual({ reservationId: 'r-1', signature: 'sig-abc' })
  })

  test('a token with no separator is malformed', () => {
    expect(decodeQrToken('nosuchseparator')).toBeNull()
  })

  test('a token with nothing before the separator is malformed', () => {
    expect(decodeQrToken('.sig-abc')).toBeNull()
  })

  test('a token with nothing after the separator is malformed', () => {
    expect(decodeQrToken('r-1.')).toBeNull()
  })
})
