import { describe, expect, it } from 'vitest'
import { ageWording, graver, orderWarnings } from '../../server/programme/guidance'

describe('orderWarnings', () => {
  it('puts depicted before discussed before mentioned, then heading, then term', () => {
    const rows = [
      { id: 'a', level: 'mentioned' as const, headingSort: 0, termSort: 0 },
      { id: 'b', level: 'depicted' as const, headingSort: 2, termSort: 0 },
      { id: 'c', level: 'discussed' as const, headingSort: 0, termSort: 5 },
      { id: 'd', level: 'depicted' as const, headingSort: 1, termSort: 9 },
      { id: 'e', level: 'depicted' as const, headingSort: 1, termSort: 3 },
      { id: 'f', level: null, headingSort: 0, termSort: 0 },
    ]
    expect(orderWarnings(rows).map(r => r.id)).toEqual(['e', 'd', 'b', 'c', 'a', 'f'])
  })
})

describe('graver', () => {
  it('keeps the more serious of two levels', () => {
    expect(graver('mentioned', 'depicted')).toBe('depicted')
    expect(graver('discussed', 'mentioned')).toBe('discussed')
  })
})

describe('ageWording', () => {
  it('words a recommendation and a restriction differently', () => {
    expect(ageWording(14, false)).toBe('Recommended for 14 and over')
    expect(ageWording(18, true)).toBe('18 and over only')
    expect(ageWording(null, false)).toBeNull()
  })
})
