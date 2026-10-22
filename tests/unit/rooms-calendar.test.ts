import { describe, expect, test } from 'bun:test'
import { SU_ROOM_ASK, SU_ROOMS, saysExternalStatus } from '#shared/utils/external-requests'
import { dateStrip } from '#shared/utils/rooms'
import { fromLondonWallClock } from '#shared/utils/london'
import { gridFirstHour, saysSlot, slotState } from '#shared/utils/room-grid'

// Issue 1346: a day on the room calendar is one tap on a phone, the room names stay in view down
// a long day, and a room the Students' Union lends goes by one name with statuses saying whose move it is.

describe('the fortnight a phone picks its day from', () => {
  test('fourteen London days from the one given, each named short', () => {
    const strip = dateStrip('2026-09-27')
    expect(strip).toHaveLength(14)
    expect(strip[0]).toEqual({ day: '2026-09-27', weekday: 'Sun', date: 27 })
    expect(strip[1]).toEqual({ day: '2026-09-28', weekday: 'Mon', date: 28 })
    expect(strip.at(-1)?.day).toBe('2026-10-10')
  })

  test('the night the clocks go back is one day like any other (0014)', () => {
    const days = dateStrip('2026-10-24', 3).map(one => one.day)
    expect(days).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })
})

describe('one name for a room the Students\' Union lends', () => {
  test('the action and the list share the name', () => {
    expect(SU_ROOM_ASK).toBe('Ask for a Students\' Union room')
    expect(SU_ROOMS).toBe('Students\' Union rooms')
  })

  test('a status says whose move it is', () => {
    expect(saysExternalStatus('REQUESTED')).toBe('Waiting on the Theatre Manager')
    expect(saysExternalStatus('AWAITING_EXTERNAL')).toBe('Waiting on the Students\' Union')
    expect(saysExternalStatus('CONFIRMED')).toBe('Confirmed')
  })
})

// The same name where an officer or a setting reads it, and in the audit trail (issue 1346).
describe('the name reaches the trail, the settings and the personal-data notes', () => {
  test('no reader-facing string calls them rooms we do not manage', async () => {
    const { AUDIT_ACTIONS } = await import('#shared/utils/audit-actions')
    const { configHeading } = await import('#shared/utils/config-wording')
    const { CONFIG_KEYS } = await import('#shared/utils/config')
    const readerFacing = [
      AUDIT_ACTIONS['room.request.unlisted'].label,
      configHeading('EXTERNAL_REQUEST_NOTICE_WORKING_DAYS'),
      CONFIG_KEYS.EXTERNAL_REQUEST_NOTICE_WORKING_DAYS.describes,
    ]
    expect(readerFacing.filter(one => /rooms? we do not manage/i.test(one))).toEqual([])
    expect(AUDIT_ACTIONS['room.request.unlisted'].label).toBe('Request moved to a Students\' Union room')
    expect(await Bun.file('shared/utils/personal-data.ts').text()).not.toMatch(/rooms? we do not manage/i)
    expect(await Bun.file('app/pages/rooms/book.vue').text()).not.toMatch(/rooms? we do not manage/i)
  })
})

describe('the screens', () => {
  const read = (path: string): Promise<string> => Bun.file(path).text()

  test('the calendar offers a fortnight of days and a date picker, with arrows a finger can hit', async () => {
    const source = await read('app/pages/rooms/index.vue')
    expect(source).toContain('data-test="date-strip"')
    expect(source).toContain('dateStrip(')
    expect(source).toContain('data-test="calendar-pick-day"')
    expect(source).toMatch(/data-test="calendar-back"[\s\S]{0,200}min-h-11|min-h-11[\s\S]{0,200}data-test="calendar-back"/)
  })

  test('the room names stay at the top of a long day', async () => {
    expect(await read('app/components/RoomGrid.vue')).toContain('sticky top-')
  })

  // A phone scrolls a day of many rooms sideways too, so the times stay down its left edge, and
  // the corner stays above both (issue 1346 follow-up).
  test('the times stay down the left edge, and the corner above both', async () => {
    const source = await read('app/components/RoomGrid.vue')
    expect(source).toMatch(/class="sticky left-0 [^"]*"[^>]*>\s*<span v-if="slot\.minutes % 60 === 0">/)
    expect(source).toMatch(/class="sticky top-0 left-0 z-20[^"]*"[^>]*>\s*Time/)
    expect(source).toContain('scroll-pl-16')
  })

  test('no member screen calls it a room not listed here, or one we do not manage', async () => {
    for (const path of ['app/pages/rooms/index.vue', 'app/pages/rooms/external.vue', 'app/pages/rooms/mine.vue']) {
      const source = await read(path)
      expect(source).not.toContain('not listed here')
      expect(source).not.toContain('Rooms we do not manage')
    }
    expect(await read('app/pages/rooms/index.vue')).toContain('SU_ROOM_ASK')
    expect(await read('app/pages/rooms/external.vue')).toContain('SU_ROOM_ASK')
    expect(await read('app/pages/rooms/mine.vue')).toContain('SU_ROOMS')
  })

  test('the console calls its catalogue the same', async () => {
    expect(await read('shared/utils/site-nav.ts')).not.toContain('\'Other rooms\'')
    // The member's own calendar feed names an unassigned ask the same way.
    expect(await read('server/routes/rooms/feed/[token]/calendar.ics.get.ts')).not.toContain('not listed here')
  })
})

// Review of 21 October 2026 (rooms, section 2): what the calendar drew and said.
describe('a booking outside the room\'s hours is drawn, not hidden', () => {
  const at = (day: number, hour: number): number => Math.floor(fromLondonWallClock(2026, 11, day, hour).getTime() / 1000)
  const weekdays = [1, 2, 3, 4, 5].map(weekday => ({ weekday, opens: '09:00', closes: '22:00' }))
  const exception = { startsAt: at(8, 19), endsAt: at(8, 21), status: 'CONFIRMED', mine: false }
  const studio = { hours: weekdays, taken: [exception] }
  const before = at(1, 12)

  test('a Sunday the studio is shut still shows the exception an officer agreed', () => {
    expect(slotState(studio, '2026-11-08', 19 * 60, 15, before)).toBe('booked')
    expect(slotState(studio, '2026-11-08', 20 * 60 + 45, 15, before)).toBe('booked')
    expect(slotState(studio, '2026-11-08', 21 * 60, 15, before)).toBe('closed')
    expect(slotState({ ...studio, taken: [{ ...exception, mine: true }] }, '2026-11-08', 19 * 60, 15, before)).toBe('mine')
  })

  test('a closure still outranks the booking, and an open free slot is still free', () => {
    const closed = [{ startsAt: at(8, 18), endsAt: at(8, 23), reason: 'The Seagull is on' }]
    expect(slotState({ ...studio, closed }, '2026-11-08', 19 * 60, 15, before)).toBe('blacked-out')
    expect(slotState(studio, '2026-11-09', 19 * 60, 15, before)).toBe('free')
    expect(slotState(studio, '2026-11-09', 8 * 60, 15, before)).toBe('closed')
  })

  test('the week table counts it rather than calling the day not open', async () => {
    expect(await Bun.file('app/pages/rooms/index.vue').text()).toContain('v-if="cell.closed && !cell.held"')
  })
})

describe('the first hour the day view draws', () => {
  const studio = { hours: [{ weekday: 4, opens: '07:00', closes: '22:00' }], taken: [] }

  test('the earliest a room shown opens that day, never later than eight', () => {
    expect(gridFirstHour([{ place: studio, day: '2026-10-29' }])).toBe(7)
    expect(gridFirstHour([{ place: studio, day: '2026-10-30' }])).toBe(8)
    expect(gridFirstHour([{ place: { ...studio, hours: [{ weekday: 4, opens: '10:00', closes: '22:00' }] }, day: '2026-10-29' }])).toBe(8)
  })

  test('six for a room that never shuts, and earlier for a booking that starts before', () => {
    const always = { hours: [], taken: [] }
    expect(gridFirstHour([{ place: studio, day: '2026-10-29' }, { place: always, day: '2026-10-29' }])).toBe(6)
    const early = Math.floor(fromLondonWallClock(2026, 10, 29, 5, 30).getTime() / 1000)
    expect(gridFirstHour([{ place: { ...always, taken: [{ startsAt: early, endsAt: early + 3600, status: 'CONFIRMED', mine: true }] }, day: '2026-10-29' }])).toBe(5)
  })

  test('the calendar hands the grid that hour', async () => {
    expect(await Bun.file('app/pages/rooms/index.vue').text()).toContain(':starts-at="gridFrom"')
  })
})

describe('what a slot and the calendar say', () => {
  test('a slot names its room and its day once each', () => {
    expect(saysSlot('The Studio', '2026-10-29', 18 * 60, 'free')).toBe('The Studio, Thu 29 Oct at 18:00: free')
  })

  test('the view, the room and the day are kept in the address', async () => {
    const source = await Bun.file('app/pages/rooms/index.vue').text()
    expect(source).toContain('asked(\'view\')')
    expect(source).toContain('asked(\'room\')')
    expect(source).toContain('asked(\'day\')')
    // Replaced in history without a router navigation, which raced the slot click.
    expect(source).toContain('window.history.replaceState(window.history.state, \'\', href)')
    expect(source).not.toContain('navigateTo({\n    query')
  })

  test('an account without a membership is told above the calendar, unless it manages rooms', async () => {
    const source = await Bun.file('app/pages/rooms/index.vue').text()
    expect(source).toContain('!can(useViewer().value, memberOrGrace) && !managesRooms.value')
    expect(source).toContain('data-test="calendar-needs-membership"')
  })

  test('a lapsed member above the calendar is told to renew, not to buy one', async () => {
    const source = await Bun.file('app/pages/rooms/index.vue').text()
    expect(source).toContain('saysBookingNoMembership(useViewer().value?.membershipState.kind === \'lapsed\')')
    expect(source).not.toContain('BOOKING_NO_MEMBERSHIP')
  })

  test('an empty calendar tells an officer where to add rooms, and a member only that there are none', async () => {
    const source = await Bun.file('app/pages/rooms/index.vue').text()
    expect(source).toContain('<ULink to="/rooms/manage">Rooms</ULink>.')
    expect(source).toContain('No rooms can be booked yet.')
  })
})
