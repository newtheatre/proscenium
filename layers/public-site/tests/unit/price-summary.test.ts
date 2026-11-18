// The price line on listings and production pages: one open price reads as itself, a range as
// "From", lower prices for those who qualify by name, and a show whose every price is nothing as "Free".
import { describe, expect, it } from 'vitest'
import catalogue from '../../i18n/en-GB.json'
import { priceSummary } from '../../app/utils/price-summary'

const words = catalogue as Record<string, string>
const t = ((key: string, values: Record<string, unknown> = {}) => words[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]))) as Parameters<typeof priceSummary>[1]

describe('the price line', () => {
  it('says "Free" when every price is nothing', () => {
    expect(priceSummary({ currency: 'GBP', fromMinor: 0, toMinor: 0, others: [] }, t)).toBe('Free')
  })

  it('gives one open price as itself, with concessions and members after it', () => {
    expect(priceSummary({ currency: 'GBP', fromMinor: 1200, toMinor: 1200, others: [{ label: 'Member', amountMinor: 700 }, { label: 'Concession', amountMinor: 900 }] }, t))
      .toBe('£12 · Member £7 · Concession £9')
  })

  it('says "From" across a range of open prices and keeps pence that are not whole', () => {
    expect(priceSummary({ currency: 'GBP', fromMinor: 650, toMinor: 1500, others: [] }, t)).toBe('From £6.50')
    expect(priceSummary({ currency: 'GBP', fromMinor: 0, toMinor: 1000, others: [] }, t)).toBe('From free')
  })
})
