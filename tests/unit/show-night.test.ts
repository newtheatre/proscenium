import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import {
  SHOW_NIGHT_START_HOUR,
  currentShowNight,
  isShowNight,
  showNightBounds,
  showNightOf,
} from '#shared/utils/show-night'

// The show-night boundary (E-110), including the named clock-change regression cases (K-121).
// The runtime is UTC, so every case here is wrong for half the year unless London is pinned (0014).

const HOUR = 60 * 60 * 1000

const hoursBetween = ({ from, to }: { from: Date, to: Date }): number => (to.getTime() - from.getTime()) / HOUR

describe('a night is labelled by the London day it began (E-110 criterion 1)', () => {
  test('the boundary is 04:00, held as a constant rather than configuration', () => {
    expect(SHOW_NIGHT_START_HOUR).toBe(4)
  })

  test('an evening belongs to its own day', () => {
    expect(showNightOf(fromLondonWallClock(2026, 10, 17, 19, 30))).toBe('2026-10-17')
  })

  test('a sale at 01:00 belongs to the night before', () => {
    expect(showNightOf(fromLondonWallClock(2026, 10, 17, 1, 30))).toBe('2026-10-16')
  })

  test('03:59:59.999 is still last night; 04:00:00.000 is the new one', () => {
    expect(showNightOf(fromLondonWallClock(2026, 10, 17, 3, 59, 59, 999))).toBe('2026-10-16')
    expect(showNightOf(fromLondonWallClock(2026, 10, 17, 4, 0, 0, 0))).toBe('2026-10-17')
  })

  test('the label is ISO YYYY-MM-DD, zero padded', () => {
    expect(showNightOf(fromLondonWallClock(2026, 1, 5, 20, 0))).toBe('2026-01-05')
    expect(isShowNight('2026-01-05')).toBe(true)
    expect(isShowNight('2026-1-5')).toBe(false)
    expect(isShowNight('2026-02-30')).toBe(false)
    expect(isShowNight('2026-13-01')).toBe(false)
    expect(isShowNight('tonight')).toBe(false)
  })

  // Date.UTC reads a two-digit year as the 1900s, so an unanchored year would scope a night
  // to 1926 rather than refusing it. The label round-trips or it is not a night.
  test('a two-digit year is refused, not read as the last century', () => {
    expect(isShowNight('0026-10-17')).toBe(false)
    expect(() => showNightBounds('0026-10-17')).toThrow(/YYYY-MM-DD/)
  })

  test('a label always round-trips through its own bounds', () => {
    for (const night of ['2026-01-05', '2026-03-28', '2026-10-24', '2026-12-31']) {
      expect(showNightOf(showNightBounds(night).from)).toBe(night)
    }
  })

  test('the first night of the year began on New Year\'s Eve', () => {
    expect(showNightOf(fromLondonWallClock(2027, 1, 1, 0, 30))).toBe('2026-12-31')
  })
})

describe('the bounds of a night run 04:00 to 04:00 London (E-110 criterion 1)', () => {
  test('an ordinary night is 24 hours long and starts at 04:00 London', () => {
    const bounds = showNightBounds('2026-10-17')
    expect(bounds.from.toISOString()).toBe('2026-10-17T03:00:00.000Z')
    expect(bounds.to.toISOString()).toBe('2026-10-18T03:00:00.000Z')
    expect(hoursBetween(bounds)).toBe(24)
  })

  test('a winter night is 04:00 GMT, which is 04:00Z', () => {
    const bounds = showNightBounds('2026-01-10')
    expect(bounds.from.toISOString()).toBe('2026-01-10T04:00:00.000Z')
    expect(bounds.to.toISOString()).toBe('2026-01-11T04:00:00.000Z')
  })

  test('from is inclusive and to is exclusive', () => {
    const { from, to } = showNightBounds('2026-10-17')
    expect(showNightOf(from)).toBe('2026-10-17')
    expect(showNightOf(new Date(to.getTime() - 1))).toBe('2026-10-17')
    expect(showNightOf(to)).toBe('2026-10-18')
  })

  test('a malformed label is refused rather than guessed at', () => {
    expect(() => showNightBounds('17/10/2026')).toThrow(/YYYY-MM-DD/)
    expect(() => showNightBounds('2026-02-30')).toThrow(/YYYY-MM-DD/)
  })

  test('every instant falls inside the bounds of the night it resolves to', () => {
    // Half-hourly across a whole year, which crosses both clock changes.
    const start = Date.UTC(2026, 0, 1)
    const end = Date.UTC(2027, 0, 1)
    for (let t = start; t < end; t += HOUR / 2) {
      const at = new Date(t)
      const { from, to } = showNightBounds(showNightOf(at))
      expect(from.getTime()).toBeLessThanOrEqual(t)
      expect(to.getTime()).toBeGreaterThan(t)
    }
  })
})

describe('the clock-change nights (E-110 criterion 2)', () => {
  // 2026: clocks go forward at 01:00 GMT on 29 March, back at 02:00 BST on 25 October.

  test('the night the clocks go forward is 23 hours long', () => {
    const bounds = showNightBounds('2026-03-28')
    expect(bounds.from.toISOString()).toBe('2026-03-28T04:00:00.000Z')
    expect(bounds.to.toISOString()).toBe('2026-03-29T03:00:00.000Z')
    expect(hoursBetween(bounds)).toBe(23)
  })

  test('the night the clocks go back is 25 hours long', () => {
    const bounds = showNightBounds('2026-10-24')
    expect(bounds.from.toISOString()).toBe('2026-10-24T03:00:00.000Z')
    expect(bounds.to.toISOString()).toBe('2026-10-25T04:00:00.000Z')
    expect(hoursBetween(bounds)).toBe(25)
  })

  test('the nights either side of a clock change are 24 hours', () => {
    for (const night of ['2026-03-27', '2026-03-29', '2026-10-23', '2026-10-25']) {
      expect(hoursBetween(showNightBounds(night))).toBe(24)
    }
  })

  test('the hour that does not exist in spring still belongs to the night that began on the 28th', () => {
    // 01:30Z on 29 March is 02:30 BST; the London wall clock skipped straight from 01:00 to 02:00.
    expect(showNightOf(new Date('2026-03-29T01:30:00.000Z'))).toBe('2026-03-28')
    expect(showNightOf(new Date('2026-03-29T02:59:59.999Z'))).toBe('2026-03-28')
    expect(showNightOf(new Date('2026-03-29T03:00:00.000Z'))).toBe('2026-03-29')
  })

  test('both 01:30s on the autumn night belong to the night that began on the 24th', () => {
    // 00:30Z is 01:30 BST, the first pass; 01:30Z is 01:30 GMT, the second.
    expect(showNightOf(new Date('2026-10-25T00:30:00.000Z'))).toBe('2026-10-24')
    expect(showNightOf(new Date('2026-10-25T01:30:00.000Z'))).toBe('2026-10-24')
    expect(showNightOf(new Date('2026-10-25T03:59:59.999Z'))).toBe('2026-10-24')
    expect(showNightOf(new Date('2026-10-25T04:00:00.000Z'))).toBe('2026-10-25')
  })
})

describe('the arithmetic pins London and never reads server-local time (E-110 criterion 3)', () => {
  test('the answer is the same whatever zone the process runs in', () => {
    const was = process.env.TZ
    // 00:30 London on 17 October is 23:30Z on the 16th: a UTC reading would name the wrong night.
    const at = fromLondonWallClock(2026, 10, 17, 0, 30)
    expect(at.toISOString()).toBe('2026-10-16T23:30:00.000Z')
    try {
      for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata']) {
        process.env.TZ = zone
        expect(showNightOf(at)).toBe('2026-10-16')
        expect(showNightBounds('2026-10-16').from.toISOString()).toBe('2026-10-16T03:00:00.000Z')
        expect(hoursBetween(showNightBounds('2026-10-24'))).toBe(25)
      }
    }
    finally {
      if (was === undefined) delete process.env.TZ
      else process.env.TZ = was
    }
  })

  test('currentShowNight reads the clock once and agrees with showNightOf(now)', () => {
    const before = showNightOf(new Date())
    const current = currentShowNight()
    const after = showNightOf(new Date())
    expect([before, after]).toContain(current)
    expect(isShowNight(current)).toBe(true)
  })

  test('an invalid instant is refused', () => {
    expect(() => showNightOf(new Date('not a date'))).toThrow(/valid Date/)
  })
})

describe('a performance belongs to the evening its curtain went up (E-110 criterion 4)', () => {
  test('a late show with a 23:30 curtain ending at 01:00 is one night, not two', () => {
    const curtain = fromLondonWallClock(2026, 11, 14, 23, 30)
    const curtainDown = fromLondonWallClock(2026, 11, 15, 1, 0)
    const lastOrders = fromLondonWallClock(2026, 11, 15, 1, 45)
    expect(showNightOf(curtain)).toBe('2026-11-14')
    expect(showNightOf(curtainDown)).toBe('2026-11-14')
    expect(showNightOf(lastOrders)).toBe('2026-11-14')
  })

  test('a matinee and the evening show on the same day share a night', () => {
    expect(showNightOf(fromLondonWallClock(2026, 11, 14, 14, 30))).toBe('2026-11-14')
    expect(showNightOf(fromLondonWallClock(2026, 11, 14, 19, 30))).toBe('2026-11-14')
  })
})

describe('one definition, no second implementation (E-110 criterion 1, 0014)', () => {
  const SOURCE = ['shared', 'server', 'app']

  async function sources(): Promise<[string, string][]> {
    const found: [string, string][] = []
    for (const dir of SOURCE) {
      for (const file of new Bun.Glob('**/*.{ts,vue}').scanSync({ cwd: dir, onlyFiles: true })) {
        found.push([`${dir}/${file}`, await Bun.file(`${dir}/${file}`).text()])
      }
    }
    return found
  }

  test('the show-night names are exported from show-night.ts and nowhere else', async () => {
    const owners = new Map<string, string[]>()
    const pattern = /^export\s+(?:const|function)\s+(SHOW_NIGHT\w*|showNight\w*|currentShowNight|isShowNight)\b/gm
    for (const [path, source] of await sources()) {
      for (const [, name] of source.matchAll(pattern)) {
        owners.set(name!, [...(owners.get(name!) ?? []), path])
      }
    }
    expect([...owners.values()].flat().every(path => path === 'shared/utils/show-night.ts')).toBe(true)
    expect([...owners.keys()].sort()).toEqual(['SHOW_NIGHT_START_HOUR', 'currentShowNight', 'isShowNight', 'showNightBounds', 'showNightOf'])
  })

  // The likelier defect is not a second export but a boundary written inline in a door route.
  test('nothing else compares an hour against the boundary', async () => {
    const inline = (await sources())
      .filter(([path, source]) => path !== 'shared/utils/show-night.ts' && /hour\s*[<>]=?\s*4\b/.test(source))
      .map(([path]) => path)
    expect(inline).toEqual([])
  })
})
