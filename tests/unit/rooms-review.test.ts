import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import { clickSpan, closureCover, saysRoomClosure, slotInstant, slotPassed } from '#shared/utils/room-grid'
import { maskConflicts, saysClash } from '#shared/utils/bookings'
import { calendarFor } from '#shared/utils/ics'

// The hands-on review of 13 October 2026 (rooms): a click books what the calendar promises, the
// past is not offered, a closure names its days, and every refusal says what actually happened.

const read = (path: string): Promise<string> => Bun.file(path).text()
const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

describe('a click on a free slot (C-102 criterion 2)', () => {
  const allFree = (): boolean => true

  test('picks an hour from the slot pressed, which the calendar says it does', () => {
    expect(clickSpan(600, 15, allFree)).toEqual({ from: 600, to: 660 })
  })

  test('stops short at the first slot somebody holds', () => {
    expect(clickSpan(600, 15, minutes => minutes < 630)).toEqual({ from: 600, to: 630 })
  })

  test('stops at midnight rather than running into the next day', () => {
    expect(clickSpan(23 * 60 + 30, 15, allFree)).toEqual({ from: 1410, to: 1440 })
  })

  test('the grid treats a press and release on one slot as that click, not a quarter-hour drag', async () => {
    const source = await read('app/components/RoomGrid.vue')
    expect(source).toContain('clickSpan(')
    expect(source).toContain('drag.from === drag.to')
  })
})

describe('the past is not offered (C-105 criterion 6)', () => {
  const now = seconds(fromLondonWallClock(2026, 10, 14, 11, 20))

  test('a slot that has ended is past; one under way or ahead is not', () => {
    expect(slotPassed('2026-10-14', 11 * 60, 15, now)).toBe(true)
    expect(slotPassed('2026-10-14', 11 * 60 + 15, 15, now)).toBe(false)
    expect(slotPassed('2026-10-15', 9 * 60, 15, now)).toBe(false)
    expect(slotPassed('2026-10-12', 20 * 60, 15, now)).toBe(true)
  })

  test('the grid disables a past slot and names it, and the week table does not call a past day free', async () => {
    const grid = await read('app/components/RoomGrid.vue')
    expect(grid).toContain('slotState(')
    expect(await read('shared/utils/room-grid.ts')).toContain('slotPassed(day, minutes')
    expect(grid).toContain('\'past\': \'past\'')
    expect(await read('app/pages/rooms/index.vue')).toContain('cell.past')
  })
})

describe('a closure on the calendar (C-102 criterion 7, C-114 criterion 4)', () => {
  const evening = {
    startsAt: seconds(fromLondonWallClock(2026, 10, 13, 20, 0)),
    endsAt: seconds(fromLondonWallClock(2026, 10, 14, 0, 15)),
    reason: 'New Writing Night is on',
  }

  test('one that runs past midnight names both days, so it is not read as the day after', () => {
    expect(saysRoomClosure('The Auditorium', evening)).toBe('The Auditorium, closed Tue 13 Oct 20:00 to Wed 14 Oct 00:15: New Writing Night is on')
  })

  test('one inside a day names that day once', () => {
    const show = { startsAt: seconds(fromLondonWallClock(2026, 10, 12, 18, 30)), endsAt: seconds(fromLondonWallClock(2026, 10, 12, 22, 45)), reason: 'The Seagull is on' }
    expect(saysRoomClosure('The Auditorium', show)).toBe('The Auditorium, closed Mon 12 Oct 18:30 to 22:45: The Seagull is on')
  })

  test('the cover of a span is none, part or all', () => {
    const from = slotInstant('2026-10-13', 8 * 60)
    const to = slotInstant('2026-10-14', 0)
    expect(closureCover([], from, to)).toBe('none')
    expect(closureCover([evening], from, to)).toBe('part')
    expect(closureCover([{ ...evening, startsAt: from - 60 }], from, to)).toBe('all')
    // The evening before reaches a quarter of an hour into the 14th, which the grid does not show.
    expect(closureCover([evening], slotInstant('2026-10-14', 8 * 60), slotInstant('2026-10-15', 0))).toBe('none')
  })

  test('the grid lists only what it shows, in words that name the day, and the week table counts closures', async () => {
    const grid = await read('app/components/RoomGrid.vue')
    expect(grid).toContain('saysRoomClosure(')
    expect(grid).not.toContain('${column.room.name}, ${column.label}, ${saysClock')
    expect(await read('app/pages/rooms/index.vue')).toContain('closureCover(')
  })
})

describe('a slot that is taken says by whom only when it is the member themself (C-103, C-107)', () => {
  const span = { startsAt: 100, endsAt: 200 }

  test('their own booking is named as theirs', () => {
    expect(saysClash([{ ...span, heldBy: 'me' }], 'me')).toBe('You already have that room booked then. It is on My bookings.')
  })

  test('anybody else\'s is booked and nothing more', () => {
    expect(saysClash([{ ...span, heldBy: 'them' }], 'me')).toBe('That room is already booked then. Choose another time or room.')
    expect(saysClash([{ ...span, heldBy: 'me' }, { ...span, heldBy: 'them' }], 'me')).toBe('That room is already booked then. Choose another time or room.')
  })

  test('who holds it never leaves the server, even for an officer', () => {
    const [seen] = maskConflicts([{ ...span, title: 'Dress', bookedBy: 'Imogen', heldBy: 'u-1' }], true)
    expect(seen).toEqual({ ...span, title: 'Dress', bookedBy: 'Imogen' })
  })

  test('the routes quote it rather than claiming a race', async () => {
    for (const path of ['server/api/rooms/bookings.post.ts', 'server/api/rooms/requests.post.ts']) {
      const source = await read(path)
      expect(source).toContain('saysClash(')
      expect(source).not.toContain('Somebody booked that slot first')
    }
  })
})

describe('the booking form (C-105 criterion 5, C-108)', () => {
  test('a room that always asks opens as a request, rather than offering a booking that fails', async () => {
    const source = await read('app/pages/rooms/book.vue')
    expect(source).toContain('alwaysAsks')
    expect(source).toContain('state.asking = alwaysAsks.value')
  })

  test('a refusal stays on the form rather than in a toast that vanishes', async () => {
    const source = await read('app/pages/rooms/book.vue')
    expect(source).not.toContain('toast.add({ title: refusalText(error), color: \'error\' })')
    expect(source).toContain('data-test="booking-refusal"')
  })

  test('Repeat this booking reads with its chevron beside it', async () => {
    const source = await read('app/pages/rooms/book.vue')
    expect(source).not.toContain('class="w-full justify-between"')
  })
})

describe('a cancelled booking leaves the member\'s calendar (C-104 criteria 1 and 5)', () => {
  const booking = { id: 'b1', title: 'Rehearsal', room: 'The Studio', startsAt: 1_800_000_000, endsAt: 1_800_003_600, updatedAt: 1_800_000_500 }

  test('a cancellation is sent as one, which a calendar removes', () => {
    const file = calendarFor([{ ...booking, status: 'CANCELLED' }], { name: 'Rehearsal', host: 'example.invalid', method: 'CANCEL' })
    expect(file).toContain('METHOD:CANCEL')
    expect(file).toContain('STATUS:CANCELLED')
    expect(file).toContain('UID:booking-b1@example.invalid')
  })

  test('a published calendar is unchanged', () => {
    expect(calendarFor([{ ...booking, status: 'CONFIRMED' }], { name: 'Rehearsal', host: 'example.invalid' })).toContain('METHOD:PUBLISH')
  })

  test('every path that ends a booking a member was sent a calendar file for sends the cancellation', async () => {
    for (const path of [
      'server/api/rooms/bookings/[id]/cancel.post.ts',
      'server/utils/blackouts.ts',
      'server/api/admin/rooms/bookings/[id]/bump.post.ts',
    ]) {
      expect(await read(path)).toContain('cancellationAttachment(')
    }
  })

  test('an approval is a confirmation, so it carries the calendar file as a booking does', async () => {
    expect(await read('server/api/admin/rooms/requests/decide.post.ts')).toContain('bookingsAttachment(')
  })
})

describe('words a member or an officer reads', () => {
  test('the next booking says what it is for in words, not the stored value', async () => {
    expect(await read('app/components/my/tiles/RoomBooking.vue')).toContain('describePurpose(')
  })

  test('a Students\' Union form date reads as a day', async () => {
    const source = await read('app/pages/rooms/manage/requests.vue')
    expect(source).not.toContain('`Form in by ${row.original.formDueBy}`')
  })

  test('the officer turns a request down, which is what the member reads it as', async () => {
    const source = await read('app/pages/rooms/manage/requests.vue')
    expect(source).not.toMatch(/=> 'Reject'|>\s*Reject\s*</)
    const { render } = await import('#server/utils/templates')
    const said = render('room-rejected', { name: 'Ada', bookings: [{ room: 'The Studio', title: 'Rehearsal', when: 'Monday' }], reason: 'Clash', roomsUrl: 'x' })
    expect(said.subject).toStartWith('Turned down:')
  })
})

describe('every control on the calendar has a name (K-101)', () => {
  test('the room chooser says what it chooses', async () => {
    const source = await read('app/pages/rooms/index.vue')
    expect(source).toMatch(/aria-label="Which room"\s+data-test="calendar-room"/)
  })
})
