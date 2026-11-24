// Rule A4 on one day: the newest covering exception, then the pattern's line, then unmarked time.
import { describe, expect, it } from 'vitest'
import { resolveDay, weekdayOf, type ExceptionRow, type LineRow } from '../../server/levels'

const line = (fields: Partial<LineRow>): LineRow => ({ patternId: 'avpt_a', startsOn: '2027-01-01', endsOn: null, changedAt: 1, weekday: 2, from: '18:00', until: '22:00', level: 'busy', ...fields })
const entry = (fields: Partial<ExceptionRow>): ExceptionRow => ({ id: 'avex_a', firstDate: '2027-01-12', lastDate: '2027-01-12', weekdays: null, from: null, until: null, level: 'free', reason: null, reasonShared: false, createdAt: 1, ...fields })
const day = (lines: LineRow[], exceptions: ExceptionRow[] = [], show = true) =>
  resolveDay('2027-01-12', { lines, exceptions }, { unmarked: 'unknown', showReason: () => show }).map(p => [p.start / 60, p.end / 60, p.level, p.reason])

describe('resolveDay', () => {
  it('numbers Monday 1 to Sunday 7', () => {
    expect(weekdayOf('2027-01-11')).toBe(1)
    expect(weekdayOf('2027-01-17')).toBe(7)
  })

  it('uses the line for the weekday and leaves the rest unmarked', () => {
    expect(day([line({}), line({ weekday: 3, level: 'free' })])).toEqual([[0, 18, 'unknown', undefined], [18, 22, 'busy', undefined], [22, 24, 'unknown', undefined]])
  })

  it('ignores a pattern whose dates do not cover the day', () => {
    expect(day([line({ startsOn: '2027-02-01' })])).toEqual([[0, 24, 'unknown', undefined]])
  })

  it('lets the newest exception win and joins equal neighbours', () => {
    const old = entry({ id: 'avex_old', level: 'maybe', createdAt: 1 })
    const newer = entry({ id: 'avex_new', from: '20:00', until: '24:00', level: 'busy', createdAt: 2 })
    expect(day([line({})], [old, newer])).toEqual([[0, 20, 'maybe', undefined], [20, 24, 'busy', undefined]])
  })

  it('covers only the weekdays an exception names', () => {
    expect(day([], [entry({ weekdays: [3] })])).toEqual([[0, 24, 'unknown', undefined]])
    expect(day([], [entry({ weekdays: [2] })])).toEqual([[0, 24, 'free', undefined]])
  })

  it('shows a reason only when allowed', () => {
    const exam = entry({ level: 'busy', reason: 'Exam' })
    expect(day([], [exam])).toEqual([[0, 24, 'busy', 'Exam']])
    expect(day([], [exam], false)).toEqual([[0, 24, 'busy', undefined]])
  })
})

describe('imported calendar time (A4, I3, T-AV-36)', () => {
  const imported = { '2027-01-12': [{ start: 1080, end: 1200, level: 'busy' as const, label: 'Uni' }, { start: 1140, end: 1260, level: 'maybe' as const, label: 'Uni' }] }
  const run = (exceptions: ExceptionRow[], own = false) => resolveDay('2027-01-12', { lines: [line({ from: '17:00', until: '23:00', level: 'free' })], exceptions, imported }, { unmarked: 'unknown', showReason: () => true, own })
    .map(p => [p.start / 60, p.end / 60, p.level, p.imported])

  it('beats the pattern, with busy over maybe where blocks overlap, and is labelled only for the person', () => {
    expect(run([])).toEqual([[0, 17, 'unknown', undefined], [17, 18, 'free', undefined], [18, 20, 'busy', undefined], [20, 21, 'maybe', undefined], [21, 23, 'free', undefined], [23, 24, 'unknown', undefined]])
    expect(run([], true)[2]).toEqual([18, 20, 'busy', 'Uni'])
  })

  it('gives way to an exception the person paints', () => {
    expect(run([entry({ from: '19:00', until: '20:00', level: 'free' })]).slice(2, 4)).toEqual([[18, 19, 'busy', undefined], [19, 20, 'free', undefined]])
  })
})
