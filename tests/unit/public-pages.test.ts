import { describe, expect, test } from 'bun:test'
import { withoutPlaceholders } from '#shared/utils/editorial'
import { saysNightLine } from '#shared/utils/programme'

// Issue 1152 items 4 and 7: the booking picker's second line meant three different things
// depending on the night, and a page the committee has not written yet was linked from the footer.

const night = (availability: 'AVAILABLE' | 'LIMITED' | 'SOLD_OUT' | 'BOOKING_CLOSED', remaining: number | null) =>
  ({ availability, remaining, venueName: 'The New Theatre' })

describe('every night in the booking picker says what it is (D-104 criterion 8)', () => {
  test('an available night says so rather than naming its venue', () => {
    expect(saysNightLine(night('AVAILABLE', null), false)).toBe('Tickets available')
  })

  test('a limited night carries the figure the show page carries', () => {
    expect(saysNightLine(night('LIMITED', 4), false)).toBe('4 tickets left')
    expect(saysNightLine(night('LIMITED', 1), false)).toBe('1 ticket left')
  })

  test('a full night and a closed night are told apart', () => {
    expect(saysNightLine(night('SOLD_OUT', 0), false)).toBe('Sold out')
    expect(saysNightLine(night('BOOKING_CLOSED', null), false)).toBe('Booking closed')
  })

  test('the venue joins the line only when the run uses more than one', () => {
    expect(saysNightLine(night('AVAILABLE', null), true)).toBe('The New Theatre · Tickets available')
    expect(saysNightLine(night('SOLD_OUT', 0), true)).toBe('The New Theatre · Sold out')
  })

  // Four states, four answers: the line is never the same sentence for two different situations.
  test('no two states share a line', () => {
    const lines = [
      saysNightLine(night('AVAILABLE', null), false),
      saysNightLine(night('LIMITED', 3), false),
      saysNightLine(night('SOLD_OUT', 0), false),
      saysNightLine(night('BOOKING_CLOSED', null), false),
    ]
    expect(new Set(lines).size).toBe(4)
  })
})

describe('a placeholder page is linked from nowhere (D-103 criterion 6)', () => {
  const entries = [
    { to: '/whats-on', label: 'What\'s on' },
    { to: '/about', label: 'About us' },
    { to: '/policies/booking', label: 'Tickets and refunds' },
  ]

  test('a page still awaiting copy is dropped from a link list', () => {
    expect(withoutPlaceholders(entries, ['/about']).map(entry => entry.to)).toEqual(['/whats-on', '/policies/booking'])
  })

  test('nothing is dropped when nothing is a placeholder', () => {
    expect(withoutPlaceholders(entries, []).map(entry => entry.to)).toEqual(['/whats-on', '/about', '/policies/booking'])
  })

  test('a placeholder path nothing links to changes nothing', () => {
    expect(withoutPlaceholders(entries, ['/history']).length).toBe(3)
  })

  test('the order the caller declared survives the filter', () => {
    expect(withoutPlaceholders(entries, ['/whats-on']).map(entry => entry.label)).toEqual(['About us', 'Tickets and refunds'])
  })
})
