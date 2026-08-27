import { describe, expect, test } from 'bun:test'
import {
  TOTP_STEP_SECONDS,
  base32Decode,
  base32Encode,
  codeForStep,
  enrolmentUri,
  generateSecret,
  stepFor,
  verifyCode,
} from '#shared/utils/totp'

// RFC 6238's own SHA-1 test vectors, so this is checked against the standard rather than
// against itself. The secret is the ASCII "12345678901234567890" the RFC specifies.
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'))

// The RFC publishes eight digits; six-digit codes are the last six of each.
const VECTORS: Array<[seconds: number, code: string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
]

describe('RFC 6238 vectors', () => {
  test('every published vector matches', async () => {
    for (const [seconds, expected] of VECTORS) {
      const step = Math.floor(seconds / TOTP_STEP_SECONDS)
      expect(`${seconds}: ${await codeForStep(RFC_SECRET, step)}`).toBe(`${seconds}: ${expected}`)
    }
  })

  // The last vector is past 2^32 seconds, which is where a 32-bit counter would wrap.
  test('a step beyond a 32-bit counter still matches', async () => {
    const step = Math.floor(20000000000 / TOTP_STEP_SECONDS)
    expect(await codeForStep(RFC_SECRET, step)).toBe('353130')
  })
})

describe('base32', () => {
  test('a round trip returns the original bytes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20))
    expect([...base32Decode(base32Encode(bytes))]).toEqual([...bytes])
  })

  test('spaces and dashes in a manually typed key are ignored', () => {
    const secret = generateSecret()
    const typed = secret.match(/.{1,4}/g)!.join(' ')
    expect([...base32Decode(typed)]).toEqual([...base32Decode(secret)])
  })

  test('a character outside the alphabet is refused', () => {
    expect(() => base32Decode('ABC1')).toThrow(/base32/)
  })
})

describe('verifying a code', () => {
  const at = new Date('2026-08-27T12:00:00.000Z')

  test('the current code is accepted', async () => {
    const code = await codeForStep(RFC_SECRET, stepFor(at))
    expect((await verifyCode(RFC_SECRET, code, at, null)).accepted).toBe(true)
  })

  // One step either side, so a slow typist or a clock slightly out still works.
  test('one step either side is accepted', async () => {
    for (const drift of [-1, 1]) {
      const code = await codeForStep(RFC_SECRET, stepFor(at) + drift)
      expect(`${drift}: ${(await verifyCode(RFC_SECRET, code, at, null)).accepted}`).toBe(`${drift}: true`)
    }
  })

  test('two steps away is not', async () => {
    for (const drift of [-2, 2]) {
      const code = await codeForStep(RFC_SECRET, stepFor(at) + drift)
      expect(`${drift}: ${(await verifyCode(RFC_SECRET, code, at, null)).accepted}`).toBe(`${drift}: false`)
    }
  })

  // A code already spent cannot be spent again, even inside its window (criterion 1).
  test('a used code is refused on replay', async () => {
    const step = stepFor(at)
    const code = await codeForStep(RFC_SECRET, step)

    const first = await verifyCode(RFC_SECRET, code, at, null)
    expect(first).toEqual({ accepted: true, step })

    expect((await verifyCode(RFC_SECRET, code, at, first.step)).accepted).toBe(false)
  })

  test('a later code still works after an earlier one was spent', async () => {
    const step = stepFor(at)
    const next = await codeForStep(RFC_SECRET, step + 1)
    expect((await verifyCode(RFC_SECRET, next, at, step)).accepted).toBe(true)
  })

  test('anything that is not six digits is refused without hashing', async () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '12 34 56 78']) {
      expect(`${code}: ${(await verifyCode(RFC_SECRET, code, at, null)).accepted}`).toBe(`${code}: false`)
    }
  })

  test('a code with spaces in it is still read', async () => {
    const code = await codeForStep(RFC_SECRET, stepFor(at))
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
    expect((await verifyCode(RFC_SECRET, spaced, at, null)).accepted).toBe(true)
  })
})

describe('enrolment', () => {
  test('a secret is 20 bytes of base32', () => {
    expect(base32Decode(generateSecret())).toHaveLength(20)
  })

  test('two secrets differ', () => {
    expect(generateSecret()).not.toBe(generateSecret())
  })

  test('the URI carries what an authenticator needs', () => {
    const uri = new URL(enrolmentUri('ABCDEFGHIJKLMNOP', 'member@example.invalid'))
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.searchParams.get('secret')).toBe('ABCDEFGHIJKLMNOP')
    expect(uri.searchParams.get('digits')).toBe('6')
    expect(uri.searchParams.get('period')).toBe('30')
    expect(uri.searchParams.get('algorithm')).toBe('SHA1')
  })
})
