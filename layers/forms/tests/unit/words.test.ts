// Money as people read it.
import { describe, expect, it } from 'vitest'
import { moneyWords } from '../../shared/words'

describe('money in words', () => {
  it('reads minor units as the currency writes them', () => {
    expect(moneyWords(48000, 'GBP')).toBe('£480.00')
    expect(moneyWords(5, 'GBP')).toBe('£0.05')
    expect(moneyWords(1250, 'EUR')).toBe('€12.50')
    expect(moneyWords(500, 'JPY')).toBe('JP¥500')
  })
})
