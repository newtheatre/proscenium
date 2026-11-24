// Rule G1's near match (CO-06): which names count as the same company.
import { describe, expect, it } from 'vitest'
import { nameKey } from '../../shared/companies'

describe('nameKey', () => {
  it('ignores case, punctuation, accents and a leading or trailing "The"', () => {
    expect(nameKey('The Splinter Theatre')).toBe('splinter theatre')
    expect(nameKey('Splinter-Théâtre!')).toBe('splinter theatre')
    expect(nameKey('Splinter Theatre, The')).toBe('splinter theatre')
    expect(nameKey('Rough & Ready')).toBe(nameKey('Rough and Ready'))
  })

  it('keeps a name that is only "The", and words that merely contain it', () => {
    expect(nameKey('The')).toBe('')
    expect(nameKey('Theatre Royal')).toBe('theatre royal')
    expect(nameKey('Other Theatre')).toBe('other theatre')
  })
})
