import { describe, expect, test } from 'bun:test'
import { SU_ROOM_ASK, SU_ROOMS, saysExternalStatus } from '#shared/utils/external-requests'
import { dateStrip } from '#shared/utils/rooms'

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
    expect(await read('shared/utils/personal-data.ts')).not.toMatch(/rooms? we do not manage/i)
    expect(await read('app/pages/rooms/book.vue')).not.toMatch(/rooms? we do not manage/i)
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
