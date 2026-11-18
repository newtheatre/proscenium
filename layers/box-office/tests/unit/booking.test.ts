// "Add to calendar" on a booking: an iCalendar file with the performance, its place and the
// reference, its text escaped so a title with commas or semicolons reads as it is.
import { describe, expect, it } from 'vitest'
import { bookingCalendar, groupedBookingLines } from '../../app/utils/booking'

const show = { title: 'Twelfth Night; or, What You Will', productionSlug: 'twelfth-night', startsAt: Date.UTC(2027, 2, 5, 19, 30), endsAt: Date.UTC(2027, 2, 5, 22, 0), venue: 'Corn Exchange, Main house', venueSlug: 'corn-exchange', address: '1 Market Square, Ely', cancelled: false }

describe('a booking in a calendar', () => {
  it('has the performance, where it is and the reference', () => {
    const file = bookingCalendar(show, 'K7MPQ2XR', 'https://theatre.example/book/order/abc', 'Booking reference K7MPQ2XR.')
    expect(file).toContain('DTSTART:20270305T193000Z\r\n')
    expect(file).toContain('DTEND:20270305T220000Z\r\n')
    expect(file).toContain('SUMMARY:Twelfth Night\\; or\\, What You Will\r\n')
    expect(file).toContain('LOCATION:Corn Exchange\\, Main house\\, 1 Market Square\\, Ely\r\n')
    expect(file).toContain('UID:K7MPQ2XR@proscenium\r\n')
    expect(file.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  })

  it('lasts two hours where no end is known', () => {
    expect(bookingCalendar({ ...show, endsAt: show.startsAt }, 'R', 'https://theatre.example/', 'x')).toContain('DTEND:20270305T213000Z')
  })

  it('groups the lines by what they are', () => {
    const line = (id: string, band: string | null, amountMinor: number) => ({ id, performanceId: 'p', ticketType: 'Full price', band, amountMinor })
    expect(groupedBookingLines([line('a', null, 0), line('b', null, 0), line('c', 'Wheelchair space', 0)]))
      .toEqual([{ label: 'Full price', count: 2, amountMinor: 0 }, { label: 'Wheelchair space, Full price', count: 1, amountMinor: 0 }])
  })
})
