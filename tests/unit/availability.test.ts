import { describe, expect, test } from 'bun:test'
import { MAX_AVAILABILITY_DAYS, freeBetween, planWindow } from '#shared/utils/availability'

// C-103. A member plans around what is taken without learning whose it is, and a sweep that
// cannot answer honestly refuses rather than returning half of one.

const at = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000)

describe('the window a search may ask for', () => {
  test('a single day is fine', () => {
    const planned = planWindow('2026-09-14', '2026-09-14')
    expect(planned.ok).toBe(true)
  })

  test('the whole permitted span is fine, and one day more is not', () => {
    expect(planWindow('2026-09-01', '2026-10-01').ok).toBe(true)
    expect(planWindow('2026-09-01', '2026-10-02').ok).toBe(false)
    expect(MAX_AVAILABILITY_DAYS).toBe(31)
  })

  test('a window that ends before it starts is refused', () => {
    expect(planWindow('2026-09-14', '2026-09-01').ok).toBe(false)
  })

  test('something that is not a date is refused rather than guessed at', () => {
    expect(planWindow('the fourteenth', '2026-09-14').ok).toBe(false)
    expect(planWindow('2026-13-01', '2026-13-02').ok).toBe(false)
  })

  // The window is London days, so it covers the whole of both, whatever UTC says (0014).
  test('it runs from the first midnight to the last, in London', () => {
    const planned = planWindow('2026-09-14', '2026-09-14')
    if (!planned.ok) throw new Error('expected a window')

    // 2026-09-14 is British Summer Time: midnight London is 23:00 UTC the day before.
    expect(planned.fromAt.toISOString()).toBe('2026-09-13T23:00:00.000Z')
    expect(planned.toAt.toISOString()).toBe('2026-09-14T23:00:00.000Z')
  })

  test('a window across the October transition covers the extra hour', () => {
    const planned = planWindow('2026-10-24', '2026-10-25')
    if (!planned.ok) throw new Error('expected a window')

    // 24 October is BST and 26 October is GMT, so the window is 49 hours, not 48.
    const hours = (planned.toAt.getTime() - planned.fromAt.getTime()) / 3_600_000
    expect(hours).toBe(49)
  })

  test('and one across the March transition covers one fewer', () => {
    const planned = planWindow('2026-03-28', '2026-03-29')
    if (!planned.ok) throw new Error('expected a window')

    const hours = (planned.toAt.getTime() - planned.fromAt.getTime()) / 3_600_000
    expect(hours).toBe(47)
  })
})

// Criterion 3: a booking ending at 19:00 and one starting at 19:00 never conflict, so what is
// free between them is everything the taken spans do not cover.
describe('what is left between what is taken', () => {
  const day = { startsAt: at('2026-09-14T09:00:00Z'), endsAt: at('2026-09-14T17:00:00Z') }

  test('an empty day is free all through', () => {
    expect(freeBetween(day, [])).toEqual([day])
  })

  test('a booking in the middle leaves the two ends', () => {
    const taken = [{ startsAt: at('2026-09-14T11:00:00Z'), endsAt: at('2026-09-14T13:00:00Z') }]
    expect(freeBetween(day, taken)).toEqual([
      { startsAt: day.startsAt, endsAt: at('2026-09-14T11:00:00Z') },
      { startsAt: at('2026-09-14T13:00:00Z'), endsAt: day.endsAt },
    ])
  })

  test('back-to-back bookings leave no sliver between them', () => {
    const taken = [
      { startsAt: at('2026-09-14T11:00:00Z'), endsAt: at('2026-09-14T13:00:00Z') },
      { startsAt: at('2026-09-14T13:00:00Z'), endsAt: at('2026-09-14T15:00:00Z') },
    ]
    expect(freeBetween(day, taken)).toEqual([
      { startsAt: day.startsAt, endsAt: at('2026-09-14T11:00:00Z') },
      { startsAt: at('2026-09-14T15:00:00Z'), endsAt: day.endsAt },
    ])
  })

  test('a booking covering the whole day leaves nothing', () => {
    expect(freeBetween(day, [day])).toEqual([])
  })

  test('overlapping bookings are treated as the one span they cover', () => {
    const taken = [
      { startsAt: at('2026-09-14T10:00:00Z'), endsAt: at('2026-09-14T13:00:00Z') },
      { startsAt: at('2026-09-14T12:00:00Z'), endsAt: at('2026-09-14T14:00:00Z') },
    ]
    expect(freeBetween(day, taken)).toEqual([
      { startsAt: day.startsAt, endsAt: at('2026-09-14T10:00:00Z') },
      { startsAt: at('2026-09-14T14:00:00Z'), endsAt: day.endsAt },
    ])
  })

  test('a booking reaching outside the day only masks the part inside it', () => {
    const taken = [{ startsAt: at('2026-09-14T06:00:00Z'), endsAt: at('2026-09-14T11:00:00Z') }]
    expect(freeBetween(day, taken)).toEqual([{ startsAt: at('2026-09-14T11:00:00Z'), endsAt: day.endsAt }])
  })

  test('bookings arriving out of order are handled the same', () => {
    const taken = [
      { startsAt: at('2026-09-14T15:00:00Z'), endsAt: at('2026-09-14T16:00:00Z') },
      { startsAt: at('2026-09-14T11:00:00Z'), endsAt: at('2026-09-14T12:00:00Z') },
    ]
    expect(freeBetween(day, taken)).toHaveLength(3)
  })
})
