// The price line on listings and production pages: one price for everyone reads as itself, anything
// else as "From" the lowest anyone pays, and a show whose every price is nothing as "Free". A price
// held by an account (a membership, a fellowship) is never part of it.
import { describe, expect, it } from 'vitest'
import catalogue from '../../i18n/en-GB.json'
import { priceSummary } from '../../app/utils/price-summary'

const words = catalogue as Record<string, string>
const t = ((key: string, values: Record<string, unknown> = {}) => words[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]))) as Parameters<typeof priceSummary>[1]

describe('the price line', () => {
  it('says "Free" when every price is nothing', () => {
    expect(priceSummary({ currency: 'GBP', fromMinor: 0, toMinor: 0, others: [] }, t)).toBe('Free')
  })

  it('gives one price for everyone as itself, and otherwise the lowest anyone pays', () => {
    expect(priceSummary({ currency: 'GBP', fromMinor: 1200, toMinor: 1200, others: [] }, t)).toBe('£12')
    expect(priceSummary({ currency: 'GBP', fromMinor: 1200, toMinor: 1200, others: [{ label: 'Student', amountMinor: 700 }, { label: 'Concession', amountMinor: 900 }] }, t))
      .toBe('From £7')
  })

  it('leaves out a price held by an account, so a free Fellow ticket never reads "From free"', () => {
    expect(priceSummary({ currency: 'GBP', fromMinor: 1000, toMinor: 1000, others: [{ label: 'Fellow', amountMinor: 0, gated: true }, { label: 'Member', amountMinor: 600, gated: true }, { label: 'Student', amountMinor: 800 }] }, t))
      .toBe('From £8')
    expect(priceSummary({ currency: 'GBP', fromMinor: 1000, toMinor: 1000, others: [{ label: 'Fellow', amountMinor: 0, gated: true }] }, t)).toBe('£10')
    expect(priceSummary({ currency: 'GBP', fromMinor: null, toMinor: null, others: [{ label: 'Member', amountMinor: 600, gated: true }] }, t)).toBe('')
    // A membership anyone may join is not gated, so its price is "From" like any other.
    expect(priceSummary({ currency: 'GBP', fromMinor: 800, toMinor: 800, others: [{ label: 'Fellow', amountMinor: 0, gated: true }, { label: 'Member', amountMinor: 600 }] }, t)).toBe('From £6')
  })

  it('says "From" across a range of open prices and keeps pence that are not whole', () => {
    expect(priceSummary({ currency: 'GBP', fromMinor: 650, toMinor: 1500, others: [] }, t)).toBe('From £6.50')
    expect(priceSummary({ currency: 'GBP', fromMinor: 0, toMinor: 1000, others: [] }, t)).toBe('From free')
  })
})
