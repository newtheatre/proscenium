import { describe, expect, test } from 'bun:test'
import { PASS_DEVICE_LIMIT, rememberedPassTokens, rememberPassToken, rememberedUntil } from '#shared/utils/pass-device'

// D-138 criterion 2: what the browser's pass cookie holds, and for how long (0259).

describe('the remembered pass list', () => {
  test('an absent or empty cookie remembers nothing', () => {
    expect(rememberedPassTokens(undefined)).toEqual([])
    expect(rememberedPassTokens('')).toEqual([])
  })

  test('a newly opened pass goes first, and opening it again does not repeat it', () => {
    const once = rememberPassToken(['a.1', 'b.2'], 'c.3')
    expect(once).toEqual(['c.3', 'a.1', 'b.2'])
    expect(rememberPassToken(once, 'b.2')).toEqual(['b.2', 'c.3', 'a.1'])
  })

  test('it holds at most the limit, dropping the oldest', () => {
    let list: string[] = []
    for (let index = 0; index < PASS_DEVICE_LIMIT + 2; index++) list = rememberPassToken(list, `t.${index}`)
    expect(list).toHaveLength(PASS_DEVICE_LIMIT)
    expect(list[0]).toBe(`t.${PASS_DEVICE_LIMIT + 1}`)
    expect(list).not.toContain('t.0')
  })

  test('a list round-trips through the cookie value, and junk in it is dropped', () => {
    const value = rememberPassToken(['a.1'], 'b.2').join('~')
    expect(rememberedPassTokens(value)).toEqual(['b.2', 'a.1'])
    expect(rememberedPassTokens('~a.1~~b.2~')).toEqual(['a.1', 'b.2'])
  })
})

describe('how long the browser keeps it', () => {
  const now = 1_780_000_000

  test('until the latest validity ends', () => {
    expect(rememberedUntil([now + 3600, now + 86_400], now)).toBe(86_400)
  })

  test('never past the browser maximum of 400 days', () => {
    expect(rememberedUntil([now + 500 * 86_400], now)).toBe(400 * 86_400)
  })

  test('a lapsed pass is kept an hour, so its page can still say it lapsed', () => {
    expect(rememberedUntil([now - 10], now)).toBe(3600)
    expect(rememberedUntil([], now)).toBe(3600)
  })
})
