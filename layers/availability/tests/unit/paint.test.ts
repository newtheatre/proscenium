// A stroke cut into a weekday's lines: what is left of each, the new stretch, neighbours joined.
import { describe, expect, it } from 'vitest'
import { repaint, without } from '../../shared/grid'

describe('without', () => {
  it('leaves nothing, one piece or two', () => {
    expect(without({ start: 60, end: 120 }, { start: 0, end: 200 })).toEqual([])
    expect(without({ start: 60, end: 120 }, { start: 90, end: 200 })).toEqual([{ start: 60, end: 90 }])
    expect(without({ start: 60, end: 120 }, { start: 80, end: 100 })).toEqual([{ start: 60, end: 80 }, { start: 100, end: 120 }])
    expect(without({ start: 60, end: 120 }, { start: 120, end: 200 })).toEqual([{ start: 60, end: 120 }])
  })
})

describe('repaint', () => {
  const tuesday = [{ weekday: 2, from: '18:00', until: '22:00', level: 'busy' as const }, { weekday: 3, from: '09:00', until: '10:00', level: 'free' as const }]

  it('joins a stretch of the same level onto its neighbour and leaves other days alone', () => {
    expect(repaint(tuesday, 2, { start: 1320, end: 1380 }, 'busy')).toEqual([tuesday[1], { weekday: 2, from: '18:00', until: '23:00', level: 'busy' }])
  })

  it('splits a line around a different level, and clear cuts without adding', () => {
    expect(repaint(tuesday, 2, { start: 1140, end: 1200 }, 'free').filter(l => l.weekday === 2)).toEqual([
      { weekday: 2, from: '18:00', until: '19:00', level: 'busy' },
      { weekday: 2, from: '19:00', until: '20:00', level: 'free' },
      { weekday: 2, from: '20:00', until: '22:00', level: 'busy' },
    ])
    expect(repaint(tuesday, 2, { start: 0, end: 1440 }, 'clear')).toEqual([tuesday[1]])
  })

  it('writes the end of the day as 24:00', () => {
    expect(repaint([], 5, { start: 1380, end: 1440 }, 'maybe')).toEqual([{ weekday: 5, from: '23:00', until: '24:00', level: 'maybe' }])
  })
})
