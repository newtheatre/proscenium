import { describe, expect, test } from 'bun:test'
import { closeButtonLabel, closureSpan, wholeDaysByDefault } from '#shared/utils/blackouts'
import { fromLondonWallClock } from '#shared/utils/london'
import { hoursForMode, hoursModeOf, saysHoursMode } from '#shared/utils/rooms'

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
    expect(await Bun.file(ROOMS).text()).toContain('/rooms/manage/closures?close=')
  })

  test('the hours section asks for a pattern before any day, and says nothing is closed by default', async () => {
    const source = await Bun.file(ROOMS).text()
    expect(source).toContain('data-test="hours-mode"')
    expect(source).toContain('hoursForMode(')
    expect(source).not.toContain('Open one day and the rest become closed')
  })
})
