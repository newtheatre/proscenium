// The balanced AND that erasure and merge use to check every table at once.
import { describe, expect, it } from 'vitest'
import { allOf } from '../../server/identity/all-of'

const depth = (sql: string): number => {
  let deepest = 0
  let open = 0
  for (const ch of sql) {
    if (ch === '(') deepest = Math.max(deepest, ++open)
    if (ch === ')') open--
  }
  return deepest
}

describe('allOf', () => {
  it('is true for nothing and the term itself for one', () => {
    expect(allOf([])).toBe('1')
    expect(allOf(['a = 1'])).toBe('a = 1')
  })

  it('keeps every term, in order', () => {
    expect(allOf(['a', 'b', 'c'])).toBe('((a) AND (b)) AND (c)')
  })

  it('nests logarithmically, so hundreds of tables stay far inside the depth limit', () => {
    const terms = Array.from({ length: 500 }, (_, i) => `t${i}`)
    expect(depth(allOf(terms))).toBeLessThanOrEqual(10)
  })
})
