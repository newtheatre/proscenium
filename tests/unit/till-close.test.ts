import { describe, expect, test } from 'bun:test'
import { closeBreakdown, closeVariancePence, readerExpectation, saysExpectedOnTheReader } from '#shared/utils/reconciliation'
import type { BarReconciliation, NightReconciliation } from '#shared/utils/reconciliation'

// F-118 criteria 1 to 3 at the till close (issue 1308): one reader and one login serve the desk and
// the bar on a show night, so the Z is compared with the whole night, never with the bar alone.

function aBar(over: Partial<BarReconciliation> = {}): BarReconciliation {
  return {
    night: '2026-09-25',
    cardSalesPence: 0,
    ticketsPence: 0,
    tabSettlementsPence: 0,
    compsCount: 0,
    compsForegonePence: 0,
    discountsPence: 0,
    refundsPence: 0,
    tabChargesPence: 0,
    expectedPence: 0,
    ...over,
  }
}

// The review's own night: £18.90 at the bar and £28.00 at the desk, on the one reader.
function theReviewNight(): NightReconciliation {
  const bar = aBar({ cardSalesPence: 990, ticketsPence: 900, expectedPence: 1890 })
  return { bar, deskTakingsPence: 2800, wholeNightExpectedPence: 4690 }
}

describe('the close leads with what the reader should show for the whole night (criterion 1)', () => {
  test('the whole night, split between the bar and the box office', () => {
    expect(readerExpectation(theReviewNight())).toEqual({ totalPence: 4690, barPence: 1890, deskPence: 2800 })
    expect(saysExpectedOnTheReader(readerExpectation(theReviewNight()))).toBe('£46.90 (bar £18.90, box office £28.00)')
  })

  test('the bar half is the whole night\'s bar, not only this session\'s share of it', () => {
    const night = { bar: aBar({ cardSalesPence: 500, expectedPence: 500 }), deskTakingsPence: 1000, wholeNightExpectedPence: 2200 }
    expect(readerExpectation(night)).toEqual({ totalPence: 2200, barPence: 1200, deskPence: 1000 })
  })

  test('a side that took nothing is not named at nought', () => {
    expect(saysExpectedOnTheReader({ totalPence: 1890, barPence: 1890, deskPence: 0 })).toBe('£18.90, all of it at the bar')
    expect(saysExpectedOnTheReader({ totalPence: 2800, barPence: 0, deskPence: 2800 })).toBe('£28.00, all of it at the box office')
    expect(saysExpectedOnTheReader({ totalPence: 0, barPence: 0, deskPence: 0 })).toBe('£0.00')
  })
})

describe('the Z is compared with the whole night (criteria 1, 3)', () => {
  test('the correct whole-night Z has no variance to explain', () => {
    expect(closeVariancePence(theReviewNight(), 4690)).toBe(0)
  })

  test('a Z matching the bar alone is under by the box office\'s takings', () => {
    expect(closeVariancePence(theReviewNight(), 1890)).toBe(-2800)
  })
})

describe('the itemised lines say what the bar took, and nothing at nought (criterion 2)', () => {
  test('tickets taken at the bar are their own line', () => {
    const lines = closeBreakdown(theReviewNight().bar)
    expect(lines.map(line => [line.label, line.pence])).toEqual([['Drinks on card', 990], ['Tickets taken at the bar', 900]])
  })

  test('nought lines are left out, a tab and a refund among them', () => {
    const labels = closeBreakdown(aBar({ cardSalesPence: 400 })).map(line => line.label)
    expect(labels).toEqual(['Drinks on card'])
  })

  test('every figure that is not nought has its own line, in the order the reader is reconciled', () => {
    const lines = closeBreakdown(aBar({
      cardSalesPence: 1000,
      ticketsPence: 900,
      tabSettlementsPence: 700,
      compsCount: 2,
      compsForegonePence: 800,
      discountsPence: 150,
      refundsPence: 300,
      tabChargesPence: 450,
    }))
    expect(lines.map(line => line.label)).toEqual([
      'Drinks on card',
      'Tickets taken at the bar',
      'Tab settlements',
      'Comps (2), forgone',
      'Discounts given',
      'Refunds',
      'Tab charges (credit extended)',
    ])
  })

  test('a comp is counted even when what it gave away was free', () => {
    expect(closeBreakdown(aBar({ compsCount: 1, compsForegonePence: 0 })).map(line => line.label)).toEqual(['Comps (1), forgone'])
  })
})
