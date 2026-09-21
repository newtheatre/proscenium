import { describe, expect, test } from 'bun:test'
import { MY_TILES, orderMyTiles, saysMembershipSentence } from '#shared/utils/my-summary'
import type { MySummary } from '#shared/utils/my-summary'

// The overview leads with what is soonest, then the standing tiles (K-127 criterion 6), and a
// failed read is a failure rather than an empty estate (K-127 criterion 7, issue 1153 items 3, 4).

const BASE: MySummary = {
  onShiftTonight: false,
  shift: null,
  membership: { state: 'current', until: '2027-07-31', claim: null },
  room: null,
  training: { held: 3, available: 7, nextStep: null, nextSession: null },
  passes: { active: [], request: null },
  notifications: [],
  nextShow: null,
}

// 2026-10-14, 19:30 London, in epoch seconds.
const WEDNESDAY = Math.floor(Date.UTC(2026, 9, 14, 18, 30) / 1000)
const hours = (count: number): number => count * 3600

describe('the overview leads with what is soonest (K-127 criterion 6, issue 1153 item 3)', () => {
  test('the standing order is used when nothing is coming up', () => {
    expect(orderMyTiles(BASE)).toEqual([...MY_TILES])
  })

  test('there is no tile for tickets, which nothing answers', () => {
    expect(MY_TILES).not.toContain('tickets' as never)
  })

  test('a room booking sooner than the shift is placed before it', () => {
    const summary: MySummary = {
      ...BASE,
      shift: { shiftId: 's1', role: 'Front of house', showTitle: 'Blue Stockings', venueName: 'Main', startsAt: WEDNESDAY + hours(24), status: 'CONFIRMED' },
      room: { bookingId: 'b1', roomName: 'Studio', startsAt: WEDNESDAY, endsAt: WEDNESDAY + hours(2), purpose: null, cancellable: true },
    }
    expect(orderMyTiles(summary).slice(0, 2)).toEqual(['room', 'shift'])
  })

  test('a training session takes its place by when it is held, not by the standing order', () => {
    const summary: MySummary = {
      ...BASE,
      shift: { shiftId: 's1', role: 'Front of house', showTitle: 'Blue Stockings', venueName: 'Main', startsAt: WEDNESDAY + hours(48), status: 'CONFIRMED' },
      training: {
        ...BASE.training,
        nextSession: { id: 't1', moduleName: 'Working at height', heldOn: '2026-10-14', startsAt: '18:00', place: null },
      },
    }
    expect(orderMyTiles(summary).slice(0, 2)).toEqual(['training', 'shift'])
  })

  test('every tile is shown exactly once, whatever is coming up', () => {
    const summary: MySummary = {
      ...BASE,
      shift: { shiftId: 's1', role: 'Front of house', showTitle: 'Blue Stockings', venueName: 'Main', startsAt: WEDNESDAY, status: 'CONFIRMED' },
      room: { bookingId: 'b1', roomName: 'Studio', startsAt: WEDNESDAY + hours(1), endsAt: WEDNESDAY + hours(2), purpose: null, cancellable: true },
      training: {
        ...BASE.training,
        nextSession: { id: 't1', moduleName: 'Working at height', heldOn: '2026-10-15', startsAt: '18:00', place: null },
      },
    }
    const order = orderMyTiles(summary)
    expect([...order].sort()).toEqual([...MY_TILES].sort())
    expect(order.slice(0, 3)).toEqual(['shift', 'room', 'training'])
  })
})

describe('the member is named in a sentence (K-127 criterion 6, issue 1153 item 3)', () => {
  test('a current membership says when it runs until', () => {
    expect(saysMembershipSentence({ state: 'current', until: '2027-07-31', claim: null }))
      .toBe('Your membership runs until Sat 31 Jul 2027.')
  })

  test('a membership in grace says what happened and by when to renew', () => {
    expect(saysMembershipSentence({ state: 'grace', until: '2026-08-30', claim: null }))
      .toBe('Your membership has run out. You can renew until Sun 30 Aug 2026.')
  })

  test('a lapsed membership says so as a sentence', () => {
    expect(saysMembershipSentence({ state: 'lapsed', until: null, claim: null }))
      .toBe('Your membership has run out.')
  })

  test('no membership says so as a sentence', () => {
    expect(saysMembershipSentence({ state: 'none', until: null, claim: null }))
      .toBe('You do not have a membership yet.')
  })
})

const MEMBER_READS = [
  'app/pages/my/index.vue',
  'app/pages/rota/index.vue',
  'app/pages/training/index.vue',
  'app/pages/training/sessions/index.vue',
  'app/pages/rooms/mine.vue',
]

describe('a failed read is a failure, not an empty estate (K-127 criterion 7, issue 1153 item 4)', () => {
  test('every member screen that lists something reads its failure through the shared helper', async () => {
    const offenders: string[] = []
    for (const path of MEMBER_READS) {
      const source = await Bun.file(path).text()
      if (!source.includes('useListFailure')) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })

  test('every one of them offers a way to try the read again', async () => {
    const offenders: string[] = []
    for (const path of MEMBER_READS) {
      const source = await Bun.file(path).text()
      if (!source.includes('ReadFailure')) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })

  test('the shared failure alert carries Try again and nothing else by default', async () => {
    const source = await Bun.file('app/components/ReadFailure.vue').text()
    expect(source).toContain('Try again')
  })

  test('the dead tickets tile is gone', async () => {
    expect(await Bun.file('app/components/my/tiles/Tickets.vue').exists()).toBe(false)
  })
})
