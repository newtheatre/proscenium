import { describe, expect, test } from 'bun:test'
import { closeButtonLabel, closureSpan, saysCloseSpan, saysClosureSpan, saysOverlap, wholeDaysByDefault } from '#shared/utils/blackouts'
import { fromLondonWallClock } from '#shared/utils/london'
import { hoursForMode, hoursModeOf, saysHoursMode } from '#shared/utils/rooms'
import { saysDay } from '#shared/utils/when'

// Issue 1353: closing a room cannot be undone (C-114 criterion 5), so nothing is chosen for the
// officer, the button counts the damage before it is done, and a room with no hours reads as open.

const london = (day: number, hour: number, month = 10): string => fromLondonWallClock(2026, month, day, hour).toISOString()

describe('the close button counts what it will cancel before it is pressed', () => {
  test('with no room chosen it asks for one', () => {
    expect(closeButtonLabel(null, null)).toBe('Choose a room to close')
  })

  test('it names the room, then what closing it cancels', () => {
    expect(closeButtonLabel('The Studio', null)).toBe('Close The Studio')
    expect(closeButtonLabel('The Studio', 0)).toBe('Close The Studio: cancels nothing')
    expect(closeButtonLabel('The Studio', 1)).toBe('Close The Studio: cancels 1 booking')
    expect(closeButtonLabel('The Studio', 3)).toBe('Close The Studio: cancels 3 bookings')
    expect(closeButtonLabel('every room', 12)).toBe('Close every room: cancels 12 bookings')
  })
})

// The rooms review: a part-day closure read as the room shut all day, because the button named no span.
describe('the close button says the span it closes', () => {
  const at = (iso: string): Date => new Date(iso)

  test('part of one day is said by the clock alone', () => {
    const span = saysCloseSpan(at(london(5, 9, 11)), at(london(5, 18, 11)))
    expect(span).toBe('09:00 to 18:00')
    expect(closeButtonLabel('The Studio', 0, span)).toBe('Close The Studio 09:00 to 18:00: cancels nothing')
  })

  test('whole days are said as days, not as two midnights', () => {
    expect(saysClosureSpan(at(london(5, 0, 11)), at(london(7, 0, 11)))).toBe(`Thu 5 to ${saysDay('2026-11-06')} (whole days)`)
    expect(saysClosureSpan(at(london(5, 0, 11)), at(london(6, 0, 11)))).toBe(`${saysDay('2026-11-05')} (whole day)`)
    expect(saysCloseSpan(at(london(5, 0, 11)), at(london(7, 0, 11)))).toContain('(whole days)')
  })

  test('the night the clocks go back is still one whole day (0014)', () => {
    expect(saysClosureSpan(at(london(25, 0)), at(london(26, 0)))).toBe(`${saysDay('2026-10-25')} (whole day)`)
  })

  test('timed days either side keep their clocks', () => {
    expect(saysClosureSpan(at(london(5, 9, 11)), at(london(6, 18, 11)))).toContain('09:00')
  })
})

describe('an overlapping closure is warned of, never refused', () => {
  const closure = { room: 'The Studio', reason: 'Get-in', startsAt: Date.parse(london(5, 9, 11)) / 1000, endsAt: Date.parse(london(5, 18, 11)) / 1000 }

  test('nothing overlapping says nothing', () => {
    expect(saysOverlap([])).toBeNull()
  })

  test('one overlap names the room, the span and why', () => {
    expect(saysOverlap([closure])).toBe(`This overlaps a closure already set: The Studio, ${saysClosureSpan(new Date(closure.startsAt * 1000), new Date(closure.endsAt * 1000))} (Get-in)`)
  })

  test('several say how many, and a closure of every room says so', () => {
    expect(saysOverlap([{ ...closure, room: null }, closure])).toStartWith('This overlaps 2 closures already set, the first Every room,')
  })
})

describe('a closure over several days is whole days unless the officer says otherwise', () => {
  test('whole days are the default only when the closure runs past its first day', () => {
    expect(wholeDaysByDefault('2026-10-12', '2026-10-14')).toBe(true)
    expect(wholeDaysByDefault('2026-10-12', '2026-10-12')).toBe(false)
  })

  test('whole days run from midnight on the first to midnight after the last, in London', () => {
    expect(closureSpan({ day: '2026-10-12', untilDay: '2026-10-14', from: '09:00', to: '18:00', wholeDays: true }))
      .toEqual({ startsAt: london(12, 0), endsAt: london(15, 0) })
  })

  test('otherwise the times typed are the span', () => {
    expect(closureSpan({ day: '2026-10-12', untilDay: '2026-10-14', from: '09:00', to: '18:00', wholeDays: false }))
      .toEqual({ startsAt: london(12, 9), endsAt: london(14, 18) })
  })

  test('the night the clocks go back is a whole day of twenty-five hours (0014)', () => {
    const span = closureSpan({ day: '2026-10-25', untilDay: '2026-10-25', from: '09:00', to: '18:00', wholeDays: true })
    expect(span).toEqual({ startsAt: london(25, 0), endsAt: london(26, 0) })
    expect((new Date(span.endsAt).getTime() - new Date(span.startsAt).getTime()) / 3_600_000).toBe(25)
  })
})

describe('a room with no hours is open, and hours are chosen as a pattern first', () => {
  const weekdays = [1, 2, 3, 4, 5].map(weekday => ({ weekday, opens: '09:00', closes: '22:00' }))

  test('no hours is always open; Monday to Friday alike is weekdays; anything else is set each day', () => {
    expect(hoursModeOf([])).toBe('ALWAYS')
    expect(hoursModeOf(weekdays)).toBe('WEEKDAYS')
    expect(hoursModeOf([...weekdays.slice(0, 4), { weekday: 5, opens: '09:00', closes: '17:00' }])).toBe('EACH_DAY')
    expect(hoursModeOf([{ weekday: 6, opens: '10:00', closes: '16:00' }])).toBe('EACH_DAY')
  })

  test('each pattern writes the hours it names', () => {
    expect(hoursForMode('ALWAYS', '09:00', '22:00')).toEqual([])
    expect(hoursForMode('WEEKDAYS', '09:00', '22:00')).toEqual(weekdays)
  })

  test('each pattern names itself', () => {
    expect(['ALWAYS', 'WEEKDAYS', 'EACH_DAY'].map(mode => saysHoursMode(mode as never)))
      .toEqual(['Always open', 'Weekdays', 'Set each day'])
  })
})

describe('the screens', () => {
  const CLOSURES = 'app/pages/rooms/manage/closures.vue'
  const ROOMS = 'app/pages/rooms/manage/index.vue'

  test('closing starts with no room chosen, counts first, and may be opened from a room\'s row', async () => {
    const source = await Bun.file(CLOSURES).text()
    expect(source).toContain('roomId: \'\'')
    expect(source).toContain('closeButtonLabel(')
    expect(source).toContain('/api/admin/rooms/blackouts/stranded')
    expect(source).toContain('data-test="close-whole-days"')
    expect(source).toContain('route.query.close')
    // Not ready until counted: the close cannot be pressed before it has said what it cancels.
    expect(source).toMatch(/const ready = computed\([\s\S]{0,200}cancels\.value !== null/)
    expect(source).toContain('data-test="close-count-failure"')
    expect(source).toContain('data-test="close-overlap"')
    expect(source).toContain('Until must be after From')
    expect(await Bun.file(ROOMS).text()).toContain('/rooms/manage/closures?close=')
  })

  test('the hours section asks for a pattern before any day, and says nothing is closed by default', async () => {
    const source = await Bun.file(ROOMS).text()
    expect(source).toContain('data-test="hours-mode"')
    expect(source).toContain('hoursForMode(')
    expect(source).not.toContain('Open one day and the rest become closed')
  })
})
