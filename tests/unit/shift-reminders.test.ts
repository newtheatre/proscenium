import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import { MESSAGE_TYPES } from '#shared/utils/notifications'
import { tomorrowsShiftNight } from '#shared/utils/shift-reminders'

// E-109's pure boundary logic. The wiring, the idempotency and the content are pinned in
// `tests/e2e/rota-reminders.test.ts` against the real routes.

describe('"tomorrow" is the show night after the one the clock reads (E-109 criterion 2)', () => {
  test('an ordinary evening names the following calendar day', () => {
    expect(tomorrowsShiftNight(fromLondonWallClock(2026, 6, 10, 20, 0))).toBe('2026-06-11')
  })

  // 2026: clocks go forward at 01:00 GMT on 29 March, so the night labelled 2026-03-28 is the
  // 23-hour one (`tests/unit/show-night.test.ts`).
  test('the day before the clocks go forward names the 23-hour night as tomorrow', () => {
    expect(tomorrowsShiftNight(fromLondonWallClock(2026, 3, 27, 20, 0))).toBe('2026-03-28')
  })

  // Clocks go back at 02:00 BST on 25 October, so 2026-10-24 is the 25-hour night.
  test('the day before the clocks go back names the 25-hour night as tomorrow', () => {
    expect(tomorrowsShiftNight(fromLondonWallClock(2026, 10, 23, 20, 0))).toBe('2026-10-24')
  })

  // 03:59 on the 10th is still inside the night that began on the 9th, so a run one minute
  // either side of the boundary names a different tomorrow, exactly as `showNightOf` would.
  test('the 04:00 boundary moves tomorrow on, not the calendar date', () => {
    expect(tomorrowsShiftNight(fromLondonWallClock(2026, 6, 10, 3, 59))).toBe('2026-06-10')
    expect(tomorrowsShiftNight(fromLondonWallClock(2026, 6, 10, 4, 1))).toBe('2026-06-11')
  })
})

describe('a reminder is its own message type, not the confirmation\'s (E-109 criterion 4)', () => {
  test('it is registered, and distinct from the shift being confirmed', () => {
    expect(MESSAGE_TYPES['shift.reminder']).toBeDefined()
    expect(MESSAGE_TYPES['shift.reminder'].template).not.toBe(MESSAGE_TYPES['shift.approved'].template)
  })

  test('it carries the shifts topic, so a preference can govern it', () => {
    expect(MESSAGE_TYPES['shift.reminder'].topic).toBe('SHIFTS')
  })
})
