// Swapping tickets for a pass on Choose tickets (Matt, 19 November): each one swapped comes off its
// ticket's count with its reference, and each one given back returns with it.
import { describe, expect, it } from 'vitest'
import { swapTickets, type SwapState } from '../../app/utils/passSwaps'

const row = { passTypeId: 'pt', passPriceId: 'pp', ticketTypeId: 'member', name: 'Season Pass', priceName: 'Member', amountMinor: 2100 }
const start: SwapState = { counts: { 'stalls member': 2, 'stalls full': 1 }, references: { 'stalls member': ['20668685', '11112222'] }, swaps: [] }
const lines = ['stalls full', 'stalls member']

describe('swapping tickets for a pass', () => {
  it('takes one off the ticket it replaces, bringing its reference across', () => {
    const one = swapTickets(start, lines, row, 1)
    expect(one.counts).toEqual({ 'stalls member': 1, 'stalls full': 1 })
    expect(one.references['stalls member']).toEqual(['20668685'])
    expect(one.swaps).toEqual([{ ...row, count: 1, references: ['11112222'], bands: ['stalls'] }])
  })

  it('takes no more than there are tickets of that kind', () => {
    const all = swapTickets(start, lines, row, 5)
    expect(all.counts['stalls member']).toBe(0)
    expect(all.swaps[0]).toMatchObject({ count: 2, references: ['11112222', '20668685'] })
  })

  it('gives a ticket back to its part of the house, with its reference, when the pass is taken off', () => {
    const back = swapTickets(swapTickets(start, lines, row, 2), lines, row, 0)
    expect(back.counts).toEqual(start.counts)
    expect(back.references['stalls member']).toEqual(['20668685', '11112222'])
    expect(back.swaps).toEqual([])
  })

  it('takes from the last part of the house chosen first, and leaves a blank where nothing was typed', () => {
    const two = swapTickets({ counts: { 'stalls member': 1, 'circle member': 1 }, references: {}, swaps: [] }, ['stalls member', 'circle member'], row, 1)
    expect(two.counts).toEqual({ 'stalls member': 1, 'circle member': 0 })
    expect(two.swaps[0]).toMatchObject({ references: [''], bands: ['circle'] })
  })
})
