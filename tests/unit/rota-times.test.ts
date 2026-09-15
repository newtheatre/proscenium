import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock, londonClock } from '#shared/utils/london'
import {
  insideWindow,
  offsetsFor,
  performanceEnd,
  pickByWindow,
  saysWindow,
  shiftWindow,
} from '#shared/utils/rota-times'

// When a shift is worked and what its window lets its holder do (E-131, 0078), including the
// named clock-change cases: the arithmetic is absolute seconds and must not drift by an hour.

const at = (year: number, month: number, day: number, hour: number, minute = 0): number =>
  Math.floor(fromLondonWallClock(year, month, day, hour, minute).getTime() / 1000)

const clock = (seconds: number): string => londonClock(new Date(seconds * 1000))

const DEFAULTS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }

describe('a shift window is stamped from the performance and the offsets (E-131 criterion 1)', () => {
  test('the start counts back from the doors time', () => {
    const window = shiftWindow({ startsAt: at(2026, 10, 17, 19, 30), doorsAt: at(2026, 10, 17, 19, 0) }, DEFAULTS)
    expect(clock(window.startsAt)).toBe('18:30')
  })

  test('the end counts on from curtain plus running time plus intervals', () => {
    const window = shiftWindow({
      startsAt: at(2026, 10, 17, 19, 30),
      doorsAt: at(2026, 10, 17, 19, 0),
      durationMinutes: 120,
      intervalCount: 1,
      intervalMinutes: 20,
    }, DEFAULTS)
    expect(clock(window.endsAt)).toBe('22:20')
  })

  test('the curtain stands in for an unrecorded doors time', () => {
    const window = shiftWindow({ startsAt: at(2026, 10, 17, 19, 30), doorsAt: null }, DEFAULTS)
    expect(clock(window.startsAt)).toBe('19:00')
  })

  test('an unrecorded running time ends the window at the curtain plus the offset', () => {
    const performance = { startsAt: at(2026, 10, 17, 19, 30), durationMinutes: null, intervalMinutes: null }
    expect(performanceEnd(performance)).toBe(performance.startsAt)
    expect(clock(shiftWindow(performance, DEFAULTS).endsAt)).toBe('20:00')
  })

  test('an interval count with no interval length adds nothing', () => {
    const performance = { startsAt: at(2026, 10, 17, 19, 30), durationMinutes: 90, intervalCount: 2, intervalMinutes: null }
    expect(clock(shiftWindow(performance, DEFAULTS).endsAt)).toBe('21:30')
  })
})

describe('a venue template overrides either offset per role (E-131 criterion 2)', () => {
  test('null falls back to the configured default', () => {
    expect(offsetsFor({ startsBeforeDoorsMinutes: null, endsAfterEndMinutes: null }, DEFAULTS)).toEqual(DEFAULTS)
    expect(offsetsFor(null, DEFAULTS)).toEqual(DEFAULTS)
  })

  test('a bar opening an hour early and closing an hour late takes its own figures', () => {
    const offsets = offsetsFor({ startsBeforeDoorsMinutes: 60, endsAfterEndMinutes: 60 }, DEFAULTS)
    const window = shiftWindow({ startsAt: at(2026, 10, 17, 19, 30), doorsAt: at(2026, 10, 17, 19, 0), durationMinutes: 120 }, offsets)
    expect(clock(window.startsAt)).toBe('18:00')
    expect(clock(window.endsAt)).toBe('22:30')
  })

  test('one end may be overridden while the other keeps the default', () => {
    expect(offsetsFor({ startsBeforeDoorsMinutes: 45, endsAfterEndMinutes: null }, DEFAULTS))
      .toEqual({ startBeforeDoorsMinutes: 45, endAfterEndMinutes: 30 })
  })
})

describe('authority holds inside the window with a grace period (E-131 criterion 4)', () => {
  const window = { startsAt: at(2026, 10, 17, 18, 0), endsAt: at(2026, 10, 17, 22, 30) }

  test('a shift holder at 17:00 for an 18:30 door is outside it, and at 18:00 is inside', () => {
    expect(insideWindow(window, at(2026, 10, 17, 17, 0), 30)).toBe(false)
    expect(insideWindow(window, at(2026, 10, 17, 18, 0), 30)).toBe(true)
  })

  test('the grace widens both ends, inclusively', () => {
    expect(insideWindow(window, at(2026, 10, 17, 17, 30), 30)).toBe(true)
    expect(insideWindow(window, at(2026, 10, 17, 17, 29), 30)).toBe(false)
    expect(insideWindow(window, at(2026, 10, 17, 23, 0), 30)).toBe(true)
    expect(insideWindow(window, at(2026, 10, 17, 23, 1), 30)).toBe(false)
  })

  test('a shift with no window bounds nobody', () => {
    expect(insideWindow(null, at(2026, 10, 17, 5, 0), 30)).toBe(true)
    expect(insideWindow({ startsAt: at(2026, 10, 17, 18, 0), endsAt: null }, at(2026, 10, 17, 5, 0), 30)).toBe(true)
    expect(insideWindow({ startsAt: null, endsAt: at(2026, 10, 17, 22, 30) }, at(2026, 10, 17, 5, 0), 30)).toBe(true)
    expect(insideWindow({ startsAt: undefined, endsAt: undefined }, at(2026, 10, 17, 5, 0), 30)).toBe(true)
  })

  test('the refusal quotes the window in London wall clock', () => {
    expect(saysWindow(window)).toBe('18:00 to 22:30')
  })
})

describe('the clock changes are absolute seconds, not wall clock (E-131 criterion 7)', () => {
  // 25 October 2026: 02:00 BST becomes 01:00 GMT, so this night is 25 hours long.
  test('a window spanning the repeated hour is the offset it was configured with', () => {
    const curtain = at(2026, 10, 25, 0, 30)
    const window = shiftWindow({ startsAt: curtain, doorsAt: at(2026, 10, 25, 0, 0), durationMinutes: 120 }, DEFAULTS)
    expect(window.startsAt).toBe(at(2026, 10, 25, 0, 0) - 30 * 60)
    expect(window.endsAt - window.startsAt).toBe((30 + 30 + 120 + 30) * 60)
    // It opened at 23:30 BST on the 24th and closed at 02:00 GMT: two and a half hours by the
    // clock on the wall, three and a half by the clock that counts.
    expect(clock(window.endsAt)).toBe('02:00')
  })

  test('the ordinary evening of 25 October is unaffected', () => {
    const window = shiftWindow({ startsAt: at(2026, 10, 25, 19, 30), doorsAt: at(2026, 10, 25, 19, 0), durationMinutes: 120 }, DEFAULTS)
    expect(clock(window.startsAt)).toBe('18:30')
    expect(clock(window.endsAt)).toBe('22:00')
  })

  test('the evening of 26 October, the first full day of GMT, is unaffected', () => {
    const window = shiftWindow({ startsAt: at(2026, 10, 26, 19, 30), doorsAt: at(2026, 10, 26, 19, 0), durationMinutes: 120 }, DEFAULTS)
    expect(clock(window.startsAt)).toBe('18:30')
    expect(clock(window.endsAt)).toBe('22:00')
  })

  // 29 March 2026: 01:00 GMT becomes 02:00 BST, so this night is 23 hours long.
  test('a window spanning the lost hour keeps its own length', () => {
    const window = shiftWindow({ startsAt: at(2026, 3, 29, 0, 30), doorsAt: at(2026, 3, 29, 0, 0), durationMinutes: 120 }, DEFAULTS)
    expect(window.endsAt - window.startsAt).toBe((30 + 30 + 120 + 30) * 60)
    expect(clock(window.endsAt)).toBe('04:00')
  })

  test('grace either side of the lost hour is still half an hour of real time', () => {
    const window = { startsAt: at(2026, 3, 29, 0, 30), endsAt: at(2026, 3, 29, 0, 45) }
    expect(insideWindow(window, window.endsAt + 30 * 60, 30)).toBe(true)
    expect(insideWindow(window, window.endsAt + 31 * 60, 30)).toBe(false)
  })
})

describe('a sale picks the house whose window holds it (F-126 criteria 1 and 2)', () => {
  const matinee = { performanceId: 'matinee', startsAt: at(2026, 10, 17, 14, 0), endsAt: at(2026, 10, 17, 17, 0) }
  const evening = { performanceId: 'evening', startsAt: at(2026, 10, 17, 19, 0), endsAt: at(2026, 10, 17, 22, 30) }

  test('a sale inside a window takes that performance', () => {
    expect(pickByWindow([matinee, evening], at(2026, 10, 17, 14, 30))).toBe('matinee')
    expect(pickByWindow([matinee, evening], at(2026, 10, 17, 20, 30))).toBe('evening')
  })

  test('a sale inside no window takes the nearest bound', () => {
    expect(pickByWindow([matinee, evening], at(2026, 10, 17, 17, 30))).toBe('matinee')
    expect(pickByWindow([matinee, evening], at(2026, 10, 17, 23, 55))).toBe('evening')
    expect(pickByWindow([matinee, evening], at(2026, 10, 17, 12, 0))).toBe('matinee')
  })

  test('an exact tie goes to the earlier performance', () => {
    expect(pickByWindow([evening, matinee], at(2026, 10, 17, 18, 0))).toBe('matinee')
  })

  test('a night with no windows resolves no performance', () => {
    expect(pickByWindow([], at(2026, 10, 17, 20, 0))).toBe(null)
  })

  test('the order the windows arrive in does not decide the answer', () => {
    expect(pickByWindow([evening, matinee], at(2026, 10, 17, 14, 30))).toBe('matinee')
  })
})
