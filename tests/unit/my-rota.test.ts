import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import { byNight, rotaWeekSpan, saysRotaWeek } from '#shared/utils/my-rota'

// Issue 1335: "Shifts you can take" is chosen by week and read by night (0014: a night runs
// 04:00 to 04:00 London, so a matinee and the evening show share one).

describe('the week chips', () => {
  // Wednesday 7 October 2026.
  const today = '2026-10-07'

  test('coming up asks for everything from now on', () => {
    expect(rotaWeekSpan('ALL', today)).toEqual({})
  })

  test('this week runs from today to Sunday', () => {
    expect(rotaWeekSpan('THIS_WEEK', today)).toEqual({ from: '2026-10-07', to: '2026-10-11' })
  })

  test('next week is the next Monday to Sunday', () => {
    expect(rotaWeekSpan('NEXT_WEEK', today)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })

  test('later is everything from the Monday after that', () => {
    expect(rotaWeekSpan('LATER', today)).toEqual({ from: '2026-10-19' })
  })

  test('on a Sunday, this week is that one day', () => {
    expect(rotaWeekSpan('THIS_WEEK', '2026-10-11')).toEqual({ from: '2026-10-11', to: '2026-10-11' })
    expect(rotaWeekSpan('NEXT_WEEK', '2026-10-11')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })

  test('each chip names itself', () => {
    expect(['ALL', 'THIS_WEEK', 'NEXT_WEEK', 'LATER'].map(week => saysRotaWeek(week as never)))
      .toEqual(['Coming up', 'This week', 'Next week', 'Later'])
  })
})

describe('grouping by night', () => {
  const at = (day: number, hour: number): number => Math.floor(fromLondonWallClock(2026, 10, day, hour).getTime() / 1000)

  test('a matinee and the evening show share a night; the next day is another', () => {
    const groups = byNight([
      { id: 'matinee', startsAt: at(10, 14) },
      { id: 'evening', startsAt: at(10, 19) },
      { id: 'sunday', startsAt: at(11, 19) },
    ])
    expect(groups.map(group => [group.night, group.items.map(item => item.id)])).toEqual([
      ['2026-10-10', ['matinee', 'evening']],
      ['2026-10-11', ['sunday']],
    ])
  })
})
