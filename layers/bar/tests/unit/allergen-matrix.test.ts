// A product's row in the allergen matrix, judged on every one of its sizes: anything a checked size
// records is marked, contains outranks may contain, and a size not checked is never read as clear.
import { describe, expect, it } from 'vitest'
import { markOf, matrixAnswer } from '../../shared/allergen-matrix'

const pint = { contains: ['gluten'], mayContain: ['sulphites'], checked: true }
const half = { contains: ['sulphites'], mayContain: ['milk'], checked: true }
const unchecked = { contains: [], mayContain: [], checked: false }

describe('matrixAnswer', () => {
  it('marks what any checked size records, in column order, contains over may contain', () => {
    expect(matrixAnswer([pint, half])).toEqual({ contains: ['gluten', 'sulphites'], mayContain: ['milk'], checked: 'all' })
  })

  it('says a product with a size not checked is only partly checked', () => {
    expect(matrixAnswer([pint, unchecked])).toEqual({ contains: ['gluten'], mayContain: ['sulphites'], checked: 'some' })
    expect(matrixAnswer([pint, undefined]).checked).toBe('some')
  })

  it('says a product with nothing checked is not checked, whatever its answers hold', () => {
    expect(matrixAnswer([unchecked, undefined])).toEqual({ contains: [], mayContain: [], checked: 'none' })
    expect(matrixAnswer([{ contains: ['milk'], mayContain: [], checked: false }]).contains).toEqual([])
    expect(matrixAnswer([]).checked).toBe('none')
  })
})

describe('markOf', () => {
  it('marks a square contains, may contain or nothing', () => {
    const answer = matrixAnswer([pint])
    expect(markOf(answer, 'gluten')).toBe('contains')
    expect(markOf(answer, 'sulphites')).toBe('may-contain')
    expect(markOf(answer, 'milk')).toBeNull()
  })
})
