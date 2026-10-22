import { describe, expect, test } from 'bun:test'
import { TAB_CODE_LENGTH, normaliseTabCode, saysTabCode, tabCodeFromBytes } from '#shared/utils/tab-presence'

// F-108 criterion 6, 0164: the code a holder shows, and how a typed or scanned one is read.

describe('tabCodeFromBytes', () => {
  test('takes forty bits, five to a character, from Crockford\'s alphabet', () => {
    expect(tabCodeFromBytes(new Uint8Array([0, 0, 0, 0, 0, 255]))).toBe('00000000')
    expect(tabCodeFromBytes(new Uint8Array([255, 255, 255, 255, 255]))).toBe('ZZZZZZZZ')
    expect(tabCodeFromBytes(new Uint8Array([0x08, 0x86, 0x42, 0x98, 0xe8]))).toBe('12345678')
  })

  test('is always the full length and never uses I, L, O or U', () => {
    const code = tabCodeFromBytes(crypto.getRandomValues(new Uint8Array(32)))
    expect(code).toHaveLength(TAB_CODE_LENGTH)
    expect(code).not.toMatch(/[ILOU]/)
  })
})

describe('normaliseTabCode', () => {
  test('ignores case, spaces and the hyphen', () => {
    expect(normaliseTabCode(' ab12-cd34 ')).toBe('AB12CD34')
  })

  test('reads O as 0, and I or L as 1', () => {
    expect(normaliseTabCode('OIL0-1234')).toBe('01101234')
  })

  test('nothing typed is no code at all', () => {
    expect(normaliseTabCode(null)).toBeNull()
    expect(normaliseTabCode(' - ')).toBeNull()
  })
})

describe('saysTabCode', () => {
  test('splits the code in two to be read out', () => {
    expect(saysTabCode('AB12CD34')).toBe('AB12-CD34')
  })
})
